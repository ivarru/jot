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

  const visit = (node: RootContent | PhrasingContent) => {
    if (node.type === "link" && node.url.startsWith(JOT_TAG_DESTINATION_PREFIX)) {
      const name = node.url.slice(JOT_TAG_DESTINATION_PREFIX.length);
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
  const offset = Math.max(0, Math.min(markdown.length, Math.max(selection.start, selection.end)));
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
