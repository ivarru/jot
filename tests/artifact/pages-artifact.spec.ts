import { expect, test } from "@playwright/test";
import { JSDOM } from "jsdom";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputDir = path.resolve(process.env.PAGES_OUTPUT_DIR ?? ".output/public");
const basePath = normalizeBasePath(process.env.BASE_PATH ?? "/jot/");

test("GitHub Pages artifact has rewritten paths and renders at the base path", async () => {
  await expectFile(".nojekyll");
  await expectFile("index.html");
  await expectFile("manifest.webmanifest");
  await expectFile("sw.js");
  await expectFile("icons/icon.svg");
  await expectDirectory("_build/assets");

  const html = await readText("index.html");
  expect(html).toContain(`${basePath}_build/assets/`);
  expect(html).toContain(`${basePath}manifest.webmanifest`);
  expect(html).toContain(`${basePath}icons/icon.svg`);
  expect(html).not.toContain('href="/_build/');
  expect(html).not.toContain('src="/_build/');
  expect(html).not.toContain('"/_build/');

  const manifest = JSON.parse(await readText("manifest.webmanifest"));
  expect(manifest.start_url).toBe(".");
  expect(Array.isArray(manifest.icons) && manifest.icons.some((icon: { src?: string }) => icon.src === "icons/icon.svg")).toBe(true);

  const sw = await readText("sw.js");
  expect(sw).toContain("./manifest.webmanifest");
  expect(sw).toContain("./icons/icon.svg");
  expect(sw).toContain("event.request.mode === \"navigate\"");

  const assetPaths = new Set([
    ...matchAll(html, /(?:href|src)="([^"]+)"/g),
    ...matchAll(html, /"output":"([^"]+)"/g),
    ...matchAll(html, /"href":"([^"]+)"/g)
  ].filter((assetPath) => assetPath.startsWith(`${basePath}_build/assets/`)));

  expect(assetPaths.size, "No Pages asset paths were found in index.html.").toBeGreaterThan(0);

  for (const assetPath of assetPaths) {
    await expectFile(stripBasePath(assetPath));
  }

  for (const assetPath of [...assetPaths].filter((assetPath) => assetPath.endsWith(".js"))) {
    const javascript = await readText(stripBasePath(assetPath));
    for (const importPath of matchAll(javascript, /import\("\.\/([^"]+\.js)"\)/g)) {
      await expectFile(path.posix.join(path.posix.dirname(stripBasePath(assetPath)), importPath));
    }
  }

  await expectAppRendersAtBasePath(html);
});

async function expectFile(relativePath: string): Promise<void> {
  const stats = await stat(path.join(outputDir, relativePath)).catch(() => null);
  expect(stats?.isFile(), `${relativePath} is missing or not a file.`).toBe(true);
}

async function expectDirectory(relativePath: string): Promise<void> {
  const absolutePath = path.join(outputDir, relativePath);
  const stats = await stat(absolutePath).catch(() => null);
  expect(stats?.isDirectory(), `${relativePath} is missing or not a directory.`).toBe(true);
  expect((await readdir(absolutePath)).length, `${relativePath} is empty.`).toBeGreaterThan(0);
}

async function readText(relativePath: string): Promise<string> {
  return await readFile(path.join(outputDir, relativePath), "utf8");
}

function stripBasePath(assetPath: string): string {
  return assetPath.slice(basePath.length);
}

function normalizeBasePath(value: string): string {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function matchAll(value: string, pattern: RegExp): string[] {
  return [...value.matchAll(pattern)].map((match) => match[1]).filter((match): match is string => Boolean(match));
}

async function expectAppRendersAtBasePath(html: string): Promise<void> {
  const manifestMatch = html.match(/window\.manifest = (\{.*?\})<\/script>/s);
  expect(manifestMatch, "index.html does not include the client manifest.").not.toBeNull();

  const moduleScriptPath = matchAll(html, /<script type="module" src="([^"]+)"/g)[0];
  expect(moduleScriptPath?.startsWith(basePath), "index.html does not include a Pages-based module script.").toBe(true);

  const manifest = JSON.parse(manifestMatch![1]!) as Record<string, { output?: string }>;
  rewriteManifestOutputsToFileUrls(manifest);

  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: `http://127.0.0.1${basePath}`
  });
  (dom.window as typeof dom.window & { manifest: unknown }).manifest = manifest;

  const installedGlobals = installDomGlobals(dom);
  try {
    await import(pathToFileURL(path.join(outputDir, stripBasePath(moduleScriptPath!))).href);
    await expect.poll(async () => dom.window.document.getElementById("app")?.textContent ?? "").toContain(
      "Google authentication is required"
    );
    expect(dom.window.document.getElementById("app")?.textContent ?? "").not.toContain("Error | Uncaught Client Exception");
  } finally {
    restoreGlobals(installedGlobals);
    dom.window.close();
  }
}

function rewriteManifestOutputsToFileUrls(manifest: Record<string, { output?: string }>): void {
  for (const entry of Object.values(manifest)) {
    if (typeof entry.output !== "string") continue;
    expect(entry.output.startsWith(basePath), `Manifest output ${entry.output} is not under ${basePath}.`).toBe(true);
    entry.output = pathToFileURL(path.join(outputDir, stripBasePath(entry.output))).href;
  }
}

function installDomGlobals(dom: JSDOM): Map<string, PropertyDescriptor | undefined> {
  const installed = new Map<string, PropertyDescriptor | undefined>();
  const globals = [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "Node",
    "CustomEvent",
    "Event",
    "InputEvent",
    "MouseEvent",
    "KeyboardEvent"
  ] as const;

  for (const name of globals) {
    installed.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
  }

  installed.set("navigator", Object.getOwnPropertyDescriptor(globalThis, "navigator"));
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  installed.set("requestAnimationFrame", Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"));
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: dom.window.requestAnimationFrame.bind(dom.window),
    configurable: true
  });
  installed.set("cancelAnimationFrame", Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame"));
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: dom.window.cancelAnimationFrame.bind(dom.window),
    configurable: true
  });

  return installed;
}

function restoreGlobals(installed: Map<string, PropertyDescriptor | undefined>): void {
  for (const [name, descriptor] of installed) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  }
}
