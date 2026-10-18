import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.env.PAGES_OUTPUT_DIR ?? ".output/public");
const requestedBase = process.env.BASE_PATH ?? "/jot/";
const base = requestedBase === "/" ? "/" : `/${requestedBase.split("/").filter(Boolean).join("/")}/`;
// Candidate only: the production artifact does not yet ship this policy.
const candidatePolicy = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "connect-src 'self' https://www.googleapis.com https://photoslibrary.googleapis.com https://photospicker.googleapis.com https://*.googleusercontent.com https://accounts.google.com/gsi/",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "frame-src https://accounts.google.com/gsi/",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self' https://accounts.google.com",
  "manifest-src 'self'",
  "worker-src 'self'"
].join("; ");

async function serveArtifact(policy = false): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
      const relative = pathname.slice(base.length) || "index.html";
      const filename = path.resolve(output, relative);
      if (!filename.startsWith(output + path.sep)) { response.writeHead(404).end(); return; }
      let body = await readFile(filename);
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
      if (policy && relative === "index.html") {
        body = Buffer.from(body.toString().replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${candidatePolicy}">`));
      }
      response.writeHead(200, { "Content-Type": types[path.extname(filename)] ?? "application/octet-stream" });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing artifact server address");
  return { url: `http://127.0.0.1:${address.port}${base}`, close: () => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }) };
}

async function artifactFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? artifactFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

test("production public artifact excludes test auth hooks, private canaries and server sources", async () => {
  const files = await artifactFiles(output);
  expect(files.length).toBeGreaterThan(0);
  for (const filename of files) {
    const relative = path.relative(output, filename);
    expect(relative).not.toMatch(/(?:^|[/\\])(?:\.env(?:\.[^/\\]*)?|node_modules|server|tests|src)(?:[/\\]|$)/);
    expect(relative).not.toMatch(/\.(?:map|ts|tsx|pem|key)$/);
    if (!/\.(?:js|html|json)$/.test(filename)) continue;
    const text = await readFile(filename, "utf8");
    for (const marker of ["__JOT_TEST_GOOGLE_AUTH__", "test-google-client-id", "JOT_GOOGLE_TEST_ACCOUNT_EMAIL", "SYNTHETIC_NONPUBLIC_BUILD_CANARY_0025", "SYNTHETIC_UNUSED_VITE_CANARY_0025"]) {
      expect(text, `${relative} includes ${marker}`).not.toContain(marker);
    }
  }
});

test("production auth ignores forged development flags and uses the real account gate", async ({ page }) => {
  const server = await serveArtifact();
  let identityRequests = 0;
  try {
    await page.route("https://www.googleapis.com/**", route => {
      identityRequests++;
      return route.fulfill({ status: 401, json: { error: "synthetic unauthorized" } });
    });
    await page.addInitScript(() => {
      localStorage.setItem("jot.fakeAuth", "true");
      (window as unknown as Record<string, unknown>).__JOT_TEST_GOOGLE_AUTH__ = true;
      const client = { callback: (_: unknown) => {}, requestAccessToken() {
        queueMicrotask(() => client.callback({ access_token: "synthetic-production-review-token", expires_in: 3600 }));
      } };
      window.google = { accounts: { oauth2: { initTokenClient: () => client, revoke: (_: string, done: () => void) => done() } } };
    });
    await page.goto(server.url);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use development storage" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.locator(".auth-error")).toContainText("account verification failed");
    expect(identityRequests).toBe(1);
    await expect(page.getByRole("region", { name: "Daily note editor" })).toHaveCount(0);
    const scope = await page.evaluate(() => navigator.serviceWorker.ready.then(registration => registration.scope));
    expect(scope).toBe(server.url);
  } finally { await server.close(); }
});

test("candidate meta CSP allows startup and blocks inline and unlisted remote scripts and fetch", async ({ page }) => {
  const server = await serveArtifact(true);
  let remoteRequests = 0;
  try {
    await page.route("https://probe.invalid/**", route => { remoteRequests++; return route.abort(); });
    await page.goto(server.url);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await page.evaluate(async () => {
      const state = window as unknown as Record<string, unknown>;
      state.__policyViolations = [];
      document.addEventListener("securitypolicyviolation", event => {
        (state.__policyViolations as string[]).push(event.blockedURI);
      });
      const inline = document.createElement("script");
      inline.textContent = "window.__inlinePolicyProbe = true";
      document.head.append(inline);
      await new Promise<void>(resolve => {
        const remote = document.createElement("script");
        remote.src = "https://probe.invalid/script.js";
        remote.onload = remote.onerror = () => resolve();
        document.head.append(remote);
      });
      await fetch("https://probe.invalid/private-probe").catch(() => undefined);
    });
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__inlinePolicyProbe)).toBeUndefined();
    await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__policyViolations)).toContain("inline");
    expect(remoteRequests).toBe(0);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__policyViolations)).toEqual(expect.arrayContaining(["https://probe.invalid/script.js", "https://probe.invalid/private-probe"]));
  } finally { await server.close(); }
});
