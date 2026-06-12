import type { PhrasingContent, Root, RootContent } from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { isCodeFormatActive } from "./codeToggle";
import type { MarkdownSelection } from "./markdownSelection";

export type InlineMarkFormat = "italic" | "bold";

export interface InlineFormatState {
  readonly italic: boolean;
  readonly bold: boolean;
  readonly code: boolean;
}

export const inactiveInlineFormatState: InlineFormatState = {
  italic: false,
  bold: false,
  code: false
};

interface InlineFormatRange {
  readonly kind: InlineMarkFormat;
  readonly markerStart: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly markerEnd: number;
  readonly openingMarker: string;
  readonly closingMarker: string;
}

const markdownParser = remark().use(remarkGfm);
let cachedMarkdown: string | null = null;
let cachedRanges: readonly InlineFormatRange[] = [];

export function markdownInlineFormatState(markdown: string, selection: MarkdownSelection): InlineFormatState {
  const normalized = normalizeSelection(markdown, selection);

  return {
    italic: isInlineFormatActive(markdown, "italic", normalized),
    bold: isInlineFormatActive(markdown, "bold", normalized),
    code: isCodeFormatActive(markdown, normalized)
  };
}

export interface InlineMarkToggleResult {
  readonly markdown: string;
  readonly selection: MarkdownSelection;
}

export function toggleMarkdownInlineMark(
  markdown: string,
  selection: MarkdownSelection,
  kind: InlineMarkFormat
): InlineMarkToggleResult {
  const normalized = normalizeSelection(markdown, selection);
  const marker = kind === "bold" ? "**" : "*";

  if (normalized.start === normalized.end) {
    const emptyRange = emptyInlineFormatRangeContainingCursor(markdown, kind, normalized.start);
    if (emptyRange !== null) return removeInlineFormatAtCursor(markdown, normalized.start, emptyRange);

    if (inlineFormatRangeContainingCursor(markdown, kind, normalized.start) !== null) {
      return {
        markdown,
        selection: normalized
      };
    }

    return {
      markdown: replaceRange(markdown, normalized.start, normalized.start, `${marker}${marker}`),
      selection: {
        start: normalized.start + marker.length,
        end: normalized.start + marker.length
      }
    };
  }

  const range = inlineFormatRangeContainingSelection(markdown, kind, normalized);
  if (range !== null) return removeInlineFormat(markdown, normalized, range);
  if (selectionContainsBlankLine(markdown, normalized)) {
    return {
      markdown,
      selection: normalized
    };
  }

  return {
    markdown: replaceRange(markdown, normalized.start, normalized.end, `${marker}${markdown.slice(normalized.start, normalized.end)}${marker}`),
    selection: {
      start: normalized.start + marker.length,
      end: normalized.end + marker.length
    }
  };
}

function inlineFormatRangeContainingCursor(
  markdown: string,
  kind: InlineMarkFormat,
  offset: number
): InlineFormatRange | null {
  return inlineFormatRanges(markdown).find(
    (range) => range.kind === kind && offset >= range.contentStart && offset <= range.contentEnd
  ) ?? null;
}

function selectionContainsBlankLine(markdown: string, selection: MarkdownSelection): boolean {
  return /\r?\n[ \t]*\r?\n/.test(markdown.slice(selection.start, selection.end));
}

function isInlineFormatActive(markdown: string, kind: InlineMarkFormat, selection: MarkdownSelection): boolean {
  if (selection.start === selection.end) {
    return inlineFormatRangeContainingCursor(markdown, kind, selection.end) !== null;
  }

  return inlineFormatRangeContainingSelection(markdown, kind, selection) !== null;
}

function inlineFormatRangeContainingSelection(
  markdown: string,
  kind: InlineMarkFormat,
  selection: MarkdownSelection
): InlineFormatRange | null {
  return inlineFormatRanges(markdown).find(
    (range) => range.kind === kind && selection.start >= range.contentStart && selection.end <= range.contentEnd
  ) ?? null;
}

function emptyInlineFormatRangeContainingCursor(
  markdown: string,
  kind: InlineMarkFormat,
  offset: number
): InlineFormatRange | null {
  const range = inlineFormatRangeContainingCursor(markdown, kind, offset);
  return range !== null && range.contentStart === offset && range.contentEnd === offset ? range : null;
}

function inlineFormatRanges(markdown: string): readonly InlineFormatRange[] {
  if (cachedMarkdown === markdown) return cachedRanges;
  cachedMarkdown = markdown;
  cachedRanges = collectInlineFormatRanges(markdown);
  return cachedRanges;
}

function collectInlineFormatRanges(markdown: string): readonly InlineFormatRange[] {
  const ranges: InlineFormatRange[] = [];
  const root = markdownParser.parse(markdown) as Root;

  const visitPhrasing = (nodes: readonly PhrasingContent[]) => {
    for (const node of nodes) {
      if (node.type === "emphasis" || node.type === "strong") {
        const range = inlineFormatRangeFromNode(markdown, node, node.type === "strong" ? "bold" : "italic");
        if (range !== null) ranges.push(range);
        visitPhrasing(node.children);
        continue;
      }

      if ("children" in node && Array.isArray(node.children)) {
        visitPhrasing(node.children as PhrasingContent[]);
      }
    }
  };

  const visitBlock = (node: RootContent) => {
    if ("children" in node && Array.isArray(node.children)) {
      visitPhrasing(node.children as PhrasingContent[]);
    }
  };

  for (const child of root.children) visitBlock(child);
  return ranges.sort((left, right) => left.markerStart - right.markerStart);
}

function inlineFormatRangeFromNode(
  markdown: string,
  node: { readonly children: readonly PhrasingContent[] } & Positioned,
  kind: InlineMarkFormat
): InlineFormatRange | null {
  const nodeRange = positionRange(node);
  if (nodeRange === null) return null;

  const contentStart = firstPositionStart(node.children);
  const contentEnd = lastPositionEnd(node.children);
  if (contentStart === null || contentEnd === null) return null;
  if (contentStart < nodeRange.start || contentEnd > nodeRange.end) return null;

  return {
    kind,
    markerStart: nodeRange.start,
    contentStart,
    contentEnd,
    markerEnd: nodeRange.end,
    openingMarker: markdown.slice(nodeRange.start, contentStart),
    closingMarker: markdown.slice(contentEnd, nodeRange.end)
  };
}

function removeInlineFormat(markdown: string, selection: MarkdownSelection, range: InlineFormatRange): InlineMarkToggleResult {
  const selected = markdown.slice(selection.start, selection.end);
  const prefix = markdown.slice(range.contentStart, selection.start);
  const suffix = markdown.slice(selection.end, range.contentEnd);
  const replacementPrefix = prefix.length === 0 ? "" : `${range.openingMarker}${prefix}${range.closingMarker}`;
  const replacementSuffix = suffix.length === 0 ? "" : `${range.openingMarker}${suffix}${range.closingMarker}`;
  const replacement = `${replacementPrefix}${selected}${replacementSuffix}`;
  const selectionStart = range.markerStart + replacementPrefix.length;

  return {
    markdown: replaceRange(markdown, range.markerStart, range.markerEnd, replacement),
    selection: {
      start: selectionStart,
      end: selectionStart + selected.length
    }
  };
}

function removeInlineFormatAtCursor(
  markdown: string,
  offset: number,
  range: InlineFormatRange
): InlineMarkToggleResult {
  const content = markdown.slice(range.contentStart, range.contentEnd);
  const contentOffset = clamp(offset - range.contentStart, 0, content.length);
  const selectionOffset = range.markerStart + contentOffset;

  return {
    markdown: replaceRange(markdown, range.markerStart, range.markerEnd, content),
    selection: {
      start: selectionOffset,
      end: selectionOffset
    }
  };
}

type Positioned = {
  readonly position?:
    | {
        readonly start: {
          readonly offset?: number | undefined;
        };
        readonly end: {
          readonly offset?: number | undefined;
        };
      }
    | undefined;
};

function positionRange(node: Positioned): { readonly start: number; readonly end: number } | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (typeof start !== "number" || typeof end !== "number") return null;
  return { start, end };
}

function firstPositionStart(nodes: readonly Positioned[]): number | null {
  for (const node of nodes) {
    const start = node.position?.start.offset;
    if (typeof start === "number") return start;
  }
  return null;
}

function lastPositionEnd(nodes: readonly Positioned[]): number | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const end = nodes[index]?.position?.end.offset;
    if (typeof end === "number") return end;
  }
  return null;
}

function replaceRange(markdown: string, start: number, end: number, replacement: string): string {
  return `${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`;
}

function normalizeSelection(markdown: string, selection: MarkdownSelection): MarkdownSelection {
  const start = clamp(selection.start, 0, markdown.length);
  const end = clamp(selection.end, 0, markdown.length);
  return start <= end ? { start, end } : { start: end, end: start };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
