import type { PhrasingContent, Root, RootContent } from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { MarkdownSelection } from "~/editor/markdownSelection";

export const JOT_TAG_DESTINATION_PREFIX = "jot:tag/";

const markdownParser = remark().use(remarkGfm);
const TAG_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeJotTagName(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  return TAG_NAME_PATTERN.test(normalized) ? normalized : null;
}

export function jotTagMarkdown(name: string): string {
  const normalized = normalizeJotTagName(name);
  if (normalized === null) throw new Error(`Invalid Jot tag name: ${name}`);
  return `[#${normalized}](${JOT_TAG_DESTINATION_PREFIX}${normalized})`;
}

export function extractJotTags(markdown: string): readonly string[] {
  const root = markdownParser.parse(markdown) as Root;
  const tags: string[] = [];
  const seen = new Set<string>();
  const definitions = new Map<string, string>();
  const definitionKey = (identifier: string) => identifier.toUpperCase().replace(/\s+/g, " ");
  const collectDefinitions = (node: RootContent | PhrasingContent) => {
    if (node.type === "definition") {
      const key = definitionKey(node.identifier);
      if (!definitions.has(key)) definitions.set(key, node.url);
    }
    if ("children" in node) for (const child of node.children) collectDefinitions(child);
  };
  for (const node of root.children) collectDefinitions(node);

  const visit = (node: RootContent | PhrasingContent) => {
    const url = node.type === "link" ? node.url
      : node.type === "linkReference" ? definitions.get(definitionKey(node.identifier)) : undefined;
    if (url?.startsWith(JOT_TAG_DESTINATION_PREFIX)) {
      const name = url.slice(JOT_TAG_DESTINATION_PREFIX.length);
      if (normalizeJotTagName(name) === name && !seen.has(name)) {
        seen.add(name);
        tags.push(name);
      }
    }

    if (!("children" in node) || !Array.isArray(node.children)) return;
    for (const child of node.children) visit(child);
  };

  for (const node of root.children) visit(node);
  return tags;
}

export function filterJotTagSuggestions(suggestions: readonly string[], value: string): readonly string[] {
  const prefix = value.trimStart().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  if (prefix.length === 0) return suggestions;
  if (!/^[a-z0-9-]+$/.test(prefix)) return [];
  return suggestions.filter((name) => name.startsWith(prefix));
}

export function insertJotTagAtSelection(
  markdown: string,
  selection: MarkdownSelection,
  name: string
): { readonly markdown: string; readonly selection: MarkdownSelection } {
  let offset = Math.max(0, Math.min(markdown.length, Math.max(selection.start, selection.end)));
  const root = markdownParser.parse(markdown) as Root;
  const incompatibleAtCursor = (node: RootContent | PhrasingContent): RootContent | PhrasingContent | null => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined || offset < start || offset > end) return null;
    if (node.type === "heading" || node.type === "code") return node;
    if (["link", "linkReference", "inlineCode"].includes(node.type) && offset < end) return node;
    if ("children" in node) {
      for (const child of node.children) {
        const found = incompatibleAtCursor(child);
        if (found !== null) return found;
      }
    }
    return null;
  };
  let incompatible: RootContent | PhrasingContent | null = null;
  for (const node of root.children) {
    incompatible = incompatibleAtCursor(node);
    if (incompatible !== null) break;
  }
  if (incompatible !== null) offset = incompatible.position!.end.offset!;
  if (incompatible?.type === "heading" || incompatible?.type === "code") {
    const node = incompatible;
    const start = node.position!.start.offset!;
    const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
    // Continue enclosing quotes/list items, without repeating their list marker.
    const prefix = markdown.slice(lineStart, start).replace(/(?:[-+*]|\d+[.)])\s+/g, (marker) => " ".repeat(marker.length));
    const raw = markdown.slice(start, offset);
    const fence = node.type === "code" ? /^(?: {0,3})(`{3,}|~{3,})/.exec(raw)?.[1] : undefined;
    const lastLine = raw.slice(raw.lastIndexOf("\n") + 1).slice(prefix.length).trim();
    const closed = fence && raw.includes("\n") && new RegExp(`^${fence[0]}{${fence.length},}\\s*$`).test(lastLine);
    const closure = fence && !closed ? `\n${prefix}${fence}` : "";
    const replacement = `${closure}\n${prefix}\n${prefix}${jotTagMarkdown(name)}`;
    const cursor = offset + replacement.length;
    return { markdown: markdown.slice(0, offset) + replacement + markdown.slice(offset), selection: { start: cursor, end: cursor } };
  }
  const tag = jotTagMarkdown(name);
  const leadingSpace = offset > 0 && !/\s/.test(markdown[offset - 1] ?? "") ? " " : "";
  const trailingSpace = offset < markdown.length && !/\s/.test(markdown[offset] ?? "") ? " " : "";
  const replacement = `${leadingSpace}${tag}${trailingSpace}`;
  const cursor = offset + leadingSpace.length + tag.length + trailingSpace.length;

  return {
    markdown: `${markdown.slice(0, offset)}${replacement}${markdown.slice(offset)}`,
    selection: { start: cursor, end: cursor }
  };
}

/** Complete only when every prefix match agrees on additional characters. */
export function completeJotTagPrefix(tags: readonly string[], value: string): string | null {
  const matches = filterJotTagSuggestions(tags, value);
  if (!matches.length) return null;
  let prefix = matches[0]!;
  for (const tag of matches.slice(1)) {
    let length = 0;
    while (length < prefix.length && prefix[length] === tag[length]) length++;
    prefix = prefix.slice(0, length);
  }
  const current = value.trimStart().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  return prefix.length > current.length ? prefix : null;
}
