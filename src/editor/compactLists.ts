import { remark } from "remark";
import remarkGfm from "remark-gfm";

interface MarkdownNode {
  readonly type: string;
  readonly children?: readonly MarkdownNode[];
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
}

interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const markdownParser = remark().use(remarkGfm);

/**
 * Removes blank lines that make otherwise ordinary Markdown list items render as loose.
 * Paragraph breaks within a list item are preserved because they carry distinct content.
 */
export function compactMarkdownLists(markdown: string): string {
  const root = markdownParser.parse(markdown) as unknown as MarkdownNode;
  const replacements: Replacement[] = [];
  collectListGapReplacements(root, markdown, replacements);
  return applyReplacements(markdown, replacements);
}

function collectListGapReplacements(node: MarkdownNode, markdown: string, replacements: Replacement[]): void {
  if (node.type === "list") {
    const items = (node.children ?? []).filter((child) => child.type === "listItem");
    for (let index = 1; index < items.length; index += 1) {
      addListGapReplacement(items[index - 1]!, items[index]!, markdown, replacements);
    }
  }

  if (node.type === "listItem") {
    const children = node.children ?? [];
    for (let index = 1; index < children.length; index += 1) {
      if (children[index]!.type === "list") {
        addListGapReplacement(children[index - 1]!, children[index]!, markdown, replacements);
      }
    }
  }

  for (const child of node.children ?? []) {
    collectListGapReplacements(child, markdown, replacements);
  }
}

function addListGapReplacement(
  previous: MarkdownNode,
  next: MarkdownNode,
  markdown: string,
  replacements: Replacement[]
): void {
  const start = previous.position?.end.offset;
  const end = next.position?.start.offset;
  if (start === undefined || end === undefined || start >= end) return;

  const gap = markdown.slice(start, end);
  // A blank line in a blockquote retains its `>` container prefix, for example `\n>\n> `.
  if (!/\r?\n[ \t]*(?:>[ \t]*)*\r?\n/.test(gap)) return;

  const finalNewline = gap.lastIndexOf("\n");
  if (finalNewline === -1) return;
  const newline = finalNewline > 0 && gap[finalNewline - 1] === "\r" ? "\r\n" : "\n";
  replacements.push({
    start,
    end,
    text: `${newline}${gap.slice(finalNewline + 1)}`
  });
}

function applyReplacements(markdown: string, replacements: readonly Replacement[]): string {
  const uniqueReplacements = Array.from(
    new Map(replacements.map((replacement) => [`${replacement.start}:${replacement.end}`, replacement])).values()
  ).sort((left, right) => right.start - left.start);

  return uniqueReplacements.reduce(
    (result, replacement) => `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`,
    markdown
  );
}
