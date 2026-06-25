import { expect, test } from "@playwright/test";

test("preview serves referenced build assets as assets", async ({ baseURL }) => {
  const root = new URL(baseURL ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
  const html = await fetchText(root);

  expect(html).not.toContain('href="/assets/');
  expect(html).not.toContain('src="/assets/');
  expect(html).not.toContain('"assets/');

  const assetPaths = new Set([
    ...matchAll(html, /(?:href|src)="([^"]+)"/g),
    ...matchAll(html, /"output":"([^"]+)"/g),
    ...matchAll(html, /"href":"([^"]+)"/g)
  ].filter((path) => path.startsWith("/_build/assets/")));

  for (const path of assetPaths) {
    await expectAsset(new URL(path, root));
  }

  for (const path of [...assetPaths].filter((assetPath) => assetPath.endsWith(".js"))) {
    const javascript = await fetchText(new URL(path, root));
    for (const importPath of matchAll(javascript, /import\("\.\/([^"]+\.js)"\)/g)) {
      await expectAsset(new URL(importPath, new URL(path, root)));
    }
  }
});

async function expectAsset(url: URL): Promise<void> {
  const response = await fetch(url);
  expect(response.ok, `${url.href} returned HTTP ${response.status}.`).toBe(true);
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  expect(contentType, `${url.href} returned HTML instead of an asset.`).not.toContain("text/html");
  expect(body.trimStart(), `${url.href} returned index.html.`).not.toMatch(/^<!DOCTYPE html>/);
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url);
  expect(response.ok, `${url.href} returned HTTP ${response.status}.`).toBe(true);
  return await response.text();
}

function matchAll(value: string, pattern: RegExp): string[] {
  return [...value.matchAll(pattern)].map((match) => match[1]).filter((match): match is string => Boolean(match));
}
