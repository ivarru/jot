import { JSDOM } from "jsdom";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const javascriptAssets = [...assetPaths].filter((assetPath) => assetPath.endsWith(".js"));
for (const assetPath of javascriptAssets) {
  const javascript = await readText(stripBasePath(assetPath));
  const importPaths = matchAll(javascript, /import\("\.\/([^"]+\.js)"\)/g);
  for (const importPath of importPaths) {
    await assertFile(path.posix.join(path.posix.dirname(stripBasePath(assetPath)), importPath));
  }
}

await assertAppRendersAtBasePath(html);

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

async function assertAppRendersAtBasePath(html) {
  const manifestMatch = html.match(/window\.manifest = (\{.*?\})<\/script>/s);
  assert(manifestMatch, "index.html does not include the client manifest.");

  const moduleScriptPath = matchAll(html, /<script type="module" src="([^"]+)"/g)[0];
  assert(moduleScriptPath?.startsWith(basePath), "index.html does not include a Pages-based module script.");

  const manifest = JSON.parse(manifestMatch[1]);
  rewriteManifestOutputsToFileUrls(manifest);

  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    url: `http://127.0.0.1${basePath}`
  });
  dom.window.manifest = manifest;

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
  ];

  for (const name of globals) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);

  try {
    await import(pathToFileURL(path.join(outputDir, stripBasePath(moduleScriptPath))).href);

    const appText = await waitForAppText(dom, (text) =>
      text.includes("Google authentication is required") ||
      text.includes("Error | Uncaught Client Exception")
    );
    assert(appText.includes("Google authentication is required"), `App did not render at ${basePath}.`);
    assert(!appText.includes("Error | Uncaught Client Exception"), "App rendered the client exception fallback.");
  } finally {
    dom.window.close();
  }
}

function rewriteManifestOutputsToFileUrls(manifest) {
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== "object" || typeof entry.output !== "string") continue;
    assert(entry.output.startsWith(basePath), `Manifest output ${entry.output} is not under ${basePath}.`);
    entry.output = pathToFileURL(path.join(outputDir, stripBasePath(entry.output))).href;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAppText(dom, predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const appText = dom.window.document.getElementById("app")?.textContent ?? "";
    if (predicate(appText)) return appText;
    await delay(50);
  }
  return dom.window.document.getElementById("app")?.textContent ?? "";
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
