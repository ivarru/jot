import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.env.PAGES_OUTPUT_DIR ?? ".output/public");
const basePath = normalizeBasePath(process.env.BASE_PATH ?? "/jot/");

await rewriteIndexHtml();

console.log(`Prepared GitHub Pages artifact in ${outputDir} with base ${basePath}`);

async function rewriteIndexHtml() {
  if (basePath === "/") {
    return;
  }

  const indexPath = path.join(outputDir, "index.html");
  const html = await readFile(indexPath, "utf8");
  const rewritten = html.replaceAll('"/_build/', `"${basePath}_build/`);

  await writeFile(indexPath, rewritten);
}

function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
