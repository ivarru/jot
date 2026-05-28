import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.env.PAGES_OUTPUT_DIR ?? ".output/public");
const basePath = normalizeBasePath(process.env.BASE_PATH ?? "/jot/");

await assertFile(".nojekyll");
await assertFile("index.html");
await assertFile("manifest.webmanifest");
await assertFile("sw.js");
await assertFile("icons/icon.svg");
await assertDirectory("_build/assets");

const html = await readText("index.html");
assert(html.includes(`${basePath}_build/assets/`), `index.html does not reference assets under ${basePath}.`);
assert(html.includes(`${basePath}manifest.webmanifest`), `index.html does not reference manifest under ${basePath}.`);
assert(html.includes(`${basePath}icons/icon.svg`), `index.html does not reference the icon under ${basePath}.`);
assert(!html.includes('href="/_build/'), "index.html contains root-relative /_build links.");
assert(!html.includes('src="/_build/'), "index.html contains root-relative /_build scripts.");
assert(!html.includes('"/_build/'), "index.html contains root-relative /_build manifest entries.");

const manifest = JSON.parse(await readText("manifest.webmanifest"));
assert(manifest.start_url === ".", 'manifest.webmanifest start_url must be "." for project Pages.');
assert(
  Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.src === "icons/icon.svg"),
  "manifest.webmanifest must include icons/icon.svg."
);

const sw = await readText("sw.js");
assert(sw.includes("./manifest.webmanifest"), "sw.js should cache the manifest by relative path.");
assert(sw.includes("./icons/icon.svg"), "sw.js should cache the icon by relative path.");
assert(sw.includes("event.request.mode === \"navigate\""), "sw.js should provide an offline navigation fallback.");

const assetPaths = new Set([
  ...matchAll(html, /(?:href|src)="([^"]+)"/g),
  ...matchAll(html, /"output":"([^"]+)"/g),
  ...matchAll(html, /"href":"([^"]+)"/g)
].filter((assetPath) => assetPath.startsWith(`${basePath}_build/assets/`)));

assert(assetPaths.size > 0, "No Pages asset paths were found in index.html.");

for (const assetPath of assetPaths) {
  await assertFile(stripBasePath(assetPath));
}

for (const assetPath of [...assetPaths].filter((assetPath) => assetPath.endsWith(".js"))) {
  const javascript = await readText(stripBasePath(assetPath));
  const importPaths = matchAll(javascript, /import\("\.\/([^"]+\.js)"\)/g);
  for (const importPath of importPaths) {
    await assertFile(path.posix.join(path.posix.dirname(stripBasePath(assetPath)), importPath));
  }
}

console.log(`Pages smoke passed for ${outputDir} with base ${basePath}`);

async function assertFile(relativePath) {
  const absolutePath = path.join(outputDir, relativePath);
  const stats = await stat(absolutePath).catch(() => null);
  assert(stats?.isFile() === true, `${relativePath} is missing or not a file.`);
}

async function assertDirectory(relativePath) {
  const absolutePath = path.join(outputDir, relativePath);
  const stats = await stat(absolutePath).catch(() => null);
  assert(stats?.isDirectory() === true, `${relativePath} is missing or not a directory.`);
  const entries = await readdir(absolutePath);
  assert(entries.length > 0, `${relativePath} is empty.`);
}

async function readText(relativePath) {
  return await readFile(path.join(outputDir, relativePath), "utf8");
}

function stripBasePath(assetPath) {
  return assetPath.slice(basePath.length);
}

function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function matchAll(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
