import type {
  Break,
  Code,
  Content,
  FootnoteDefinition,
  Image,
  InlineCode,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
  Text
} from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

const markdownParser = remark().use(remarkGfm);
let cachedMarkdown: string | null = null;
let cachedMapping: MarkdownCursorMapping | null = null;

export function markdownSourceOffsetToRenderedOffset(markdown: string, sourceOffset: number): number {
  const mapping = markdownCursorMapping(markdown);
  return mapping.sourceToRendered[Math.max(0, Math.min(markdown.length, sourceOffset))] ?? 0;
}

export function renderedOffsetToMarkdownSourceOffset(markdown: string, renderedOffset: number): number {
  const mapping = markdownCursorMapping(markdown);
  const target = Math.max(0, renderedOffset);
  const sourceOffset = mapping.renderedToSource[Math.min(target, mapping.renderedLength)];
  return sourceOffset ?? markdown.length;
}

interface MarkdownCursorMapping {
  readonly sourceToRendered: readonly number[];
  readonly renderedToSource: readonly number[];
  readonly renderedLength: number;
}

function markdownCursorMapping(markdown: string): MarkdownCursorMapping {
  if (cachedMarkdown === markdown && cachedMapping !== null) return cachedMapping;
  const mapping = buildMarkdownCursorMapping(markdown);
  cachedMarkdown = markdown;
  cachedMapping = mapping;
  return mapping;
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

type PositionedValue = Positioned & {
  readonly value?: string | undefined;
};

function buildMarkdownCursorMapping(markdown: string): MarkdownCursorMapping {
  const sourceToRendered = new Array<number | undefined>(markdown.length + 1);
  const renderedToSource: number[] = [0];
  let rendered = 0;

  const showSourceText = (sourceStart: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      const source = sourceStart + index;
      if (source > markdown.length) break;
      sourceToRendered[source] = rendered;
      rendered += 1;
      renderedToSource[rendered] = Math.min(markdown.length, source + 1);
      sourceToRendered[Math.min(markdown.length, source + 1)] = rendered;
    }
  };
  const showRenderedText = (value: string, sourceHint: number) => {
    for (let index = 0; index < value.length; index += 1) {
      rendered += 1;
      renderedToSource[rendered] = Math.max(0, Math.min(markdown.length, sourceHint));
    }
  };

  const showInlineCode = (node: InlineCode) => {
    const range = positionRange(node);
    if (range === null) return;
    const sourceStart = findValueInRange(markdown, node.value, range.start, range.end);
    showSourceText(sourceStart ?? range.start, node.value);
  };
  const showCode = (node: Code) => {
    const range = positionRange(node);
    if (range === null) return;
    showCodeValue(
      markdown,
      node.value,
      codeContentSearchStart(markdown, node, range.start, range.end),
      range.end,
      showSourceText,
      showRenderedText
    );
  };
  const showImageAlt = (node: Image) => {
    if (!node.alt) return;
    const range = positionRange(node);
    if (range === null) return;
    const sourceStart = findImageAltStart(markdown, node.alt, range.start, range.end);
    showSourceText(sourceStart ?? range.start, node.alt);
  };

  const showPhrasing = (nodes: readonly PhrasingContent[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          showPositionedValue(node);
          break;
        case "inlineCode":
          showInlineCode(node);
          break;
        case "break":
          showBreak(node);
          break;
        case "image":
          showImageAlt(node);
          break;
        case "emphasis":
        case "strong":
        case "delete":
        case "link":
        case "linkReference":
          showPhrasing(node.children ?? []);
          preferRenderedBoundarySource(node);
          break;
        case "footnoteReference":
          preferRenderedBoundarySource(node);
          break;
        case "html":
        case "imageReference":
          showPositionedValue(node);
          break;
        default:
          break;
      }
    }
  };
  const showPositionedValue = (node: PositionedValue) => {
    if (typeof node.value !== "string") return;
    const range = positionRange(node);
    if (range === null) return;
    showSourceText(range.start, node.value);
  };
  const showBreak = (node: Break) => {
    const range = positionRange(node);
    showRenderedText("\n", range?.end ?? 0);
  };
  const showBlocks = (nodes: readonly RootContent[] | readonly Content[], separator: string) => {
    let previousEnd = 0;
    nodes.forEach((node, index) => {
      if (index > 0) showRenderedText(separator, previousEnd);
      showBlock(node);
      previousEnd = positionRange(node)?.end ?? previousEnd;
    });
  };
  const showList = (node: List) => {
    let previousEnd = positionRange(node)?.start ?? 0;
    node.children.forEach((item, index) => {
      if (index > 0) showRenderedText("\n\n", previousEnd);
      showListItem(item);
      previousEnd = positionRange(item)?.end ?? previousEnd;
    });
  };
  const showListItem = (node: ListItem) => {
    showBlocks(node.children, "\n");
  };
  const showFootnoteDefinition = (node: FootnoteDefinition) => {
    showBlocks(node.children, "\n\n");
  };
  const showTable = (node: Table) => {
    let previousEnd = positionRange(node)?.start ?? 0;
    node.children.forEach((row, index) => {
      if (index > 0) showRenderedText("\n", previousEnd);
      showTableRow(row);
      previousEnd = positionRange(row)?.end ?? previousEnd;
    });
  };
  const showTableRow = (node: TableRow) => {
    let previousEnd = positionRange(node)?.start ?? 0;
    node.children.forEach((cell, index) => {
      if (index > 0) showRenderedText("\n", previousEnd);
      showTableCell(cell);
      previousEnd = positionRange(cell)?.end ?? previousEnd;
    });
  };
  const showTableCell = (node: TableCell) => {
    showPhrasing(node.children);
  };
  const showBlock = (node: RootContent | Content) => {
    switch (node.type) {
      case "paragraph":
      case "heading":
        showPhrasing(node.children);
        break;
      case "blockquote":
        showBlocks(node.children, "\n\n");
        break;
      case "list":
        showList(node);
        break;
      case "listItem":
        showListItem(node);
        break;
      case "code":
        showCode(node);
        break;
      case "break":
        showBreak(node);
        break;
      case "thematicBreak":
        break;
      case "footnoteDefinition":
        showFootnoteDefinition(node);
        break;
      case "table":
        showTable(node);
        break;
      case "text":
      case "html":
      case "yaml":
      case "definition":
        showPositionedValue(node);
        break;
      default:
        break;
    }
  };
  const preferRenderedBoundarySource = (
    node: {
      readonly position?:
        | {
            readonly end: {
              readonly offset?: number | undefined;
            };
          }
        | undefined;
    }
  ) => {
    const source = node.position?.end?.offset;
    if (typeof source === "number") renderedToSource[rendered] = Math.max(0, Math.min(markdown.length, source));
  };

  showBlocks((markdownParser.parse(markdown) as Root).children, "\n\n");

  let lastRendered = 0;
  for (let source = 0; source < sourceToRendered.length; source += 1) {
    if (sourceToRendered[source] === undefined) {
      sourceToRendered[source] = lastRendered;
    } else {
      lastRendered = sourceToRendered[source]!;
    }
  }

  return {
    sourceToRendered: sourceToRendered as number[],
    renderedToSource,
    renderedLength: rendered
  };
}

function positionRange(node: Positioned): {
  readonly start: number;
  readonly end: number;
} | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return null;
  return { start, end };
}

function findImageAltStart(markdown: string, alt: string, start: number, end: number): number | null {
  const open = markdown.indexOf("[", start);
  if (open === -1 || open >= end) return null;
  const sourceStart = markdown.indexOf(alt, open + 1);
  return sourceStart === -1 || sourceStart >= end ? null : sourceStart;
}

function findValueInRange(markdown: string, value: string, start: number, end: number): number | null {
  const sourceStart = markdown.indexOf(value, start);
  return sourceStart === -1 || sourceStart + value.length > end ? null : sourceStart;
}

function codeContentSearchStart(markdown: string, node: Code, start: number, end: number): number {
  if (!isFencedCodeBlock(markdown, node, start)) return start;
  const openingFenceEnd = markdown.indexOf("\n", start);
  return openingFenceEnd === -1 || openingFenceEnd > end ? start : openingFenceEnd + 1;
}

function isFencedCodeBlock(markdown: string, node: Code, start: number): boolean {
  if (node.lang !== null && node.lang !== undefined) return true;
  return /^(?: {0,3})(?:`{3,}|~{3,})/.test(markdown.slice(start));
}

function showCodeValue(
  markdown: string,
  value: string,
  start: number,
  end: number,
  showSourceText: (sourceStart: number, value: string) => void,
  showRenderedText: (value: string, sourceHint: number) => void
): void {
  const lines = value.split("\n");
  let searchStart = start;
  lines.forEach((line, index) => {
    const sourceStart = line.length === 0 ? searchStart : findCodeLineStart(markdown, line, searchStart, end);
    if (line.length > 0 && sourceStart !== null) {
      showSourceText(sourceStart, line);
      searchStart = sourceStart + line.length;
    }
    if (index < lines.length - 1) {
      const lineBreak = markdown.indexOf("\n", searchStart);
      const sourceHint = lineBreak === -1 || lineBreak > end ? searchStart : lineBreak + 1;
      showRenderedText("\n", sourceHint);
      searchStart = sourceHint;
    }
  });
}

function findCodeLineStart(markdown: string, line: string, start: number, end: number): number | null {
  let searchStart = start;
  while (searchStart < end) {
    const sourceStart = markdown.indexOf(line, searchStart);
    if (sourceStart === -1 || sourceStart + line.length > end) return null;
    const lineStart = markdown.lastIndexOf("\n", sourceStart - 1) + 1;
    if (sourceStart - lineStart >= 0) return sourceStart;
    searchStart = sourceStart + 1;
  }
  return null;
}
