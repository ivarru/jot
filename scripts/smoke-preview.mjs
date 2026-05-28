const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");

const html = await fetchText(baseUrl);
assert(!html.includes('href="/assets/'), "index.html contains root /assets/ links.");
assert(!html.includes('src="/assets/'), "index.html contains root /assets/ scripts.");
assert(!html.includes('"assets/'), "index.html contains bare assets/ references.");

const assetPaths = new Set([
  ...matchAll(html, /(?:href|src)="([^"]+)"/g),
  ...matchAll(html, /"output":"([^"]+)"/g),
  ...matchAll(html, /"href":"([^"]+)"/g)
].filter((path) => path.startsWith("/_build/assets/")));

for (const path of assetPaths) {
  await assertAsset(new URL(path, baseUrl));
}

for (const path of [...assetPaths].filter((path) => path.endsWith(".js"))) {
  const javascript = await fetchText(new URL(path, baseUrl));
  const dynamicImports = matchAll(javascript, /import\("\.\/([^"]+\.js)"\)/g);
  for (const importPath of dynamicImports) {
    await assertAsset(new URL(importPath, new URL(path, baseUrl)));
  }
}

console.log(`Preview smoke passed for ${baseUrl.origin}`);

async function assertAsset(url) {
  const response = await fetch(url);
  assert(response.ok, `${url.href} returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  assert(!contentType.includes("text/html"), `${url.href} returned HTML instead of an asset.`);
  assert(!body.trimStart().startsWith("<!DOCTYPE html>"), `${url.href} returned index.html.`);
}

async function fetchText(url) {
  const response = await fetch(url);
  assert(response.ok, `${url.href} returned HTTP ${response.status}.`);
  return await response.text();
}

function matchAll(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
