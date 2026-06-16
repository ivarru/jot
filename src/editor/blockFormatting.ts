import type { MarkdownSelection } from "./markdownSelection";

export interface BlockFormatState {
  readonly quote: boolean;
}

export const inactiveBlockFormatState: BlockFormatState = {
  quote: false
};

export interface BlockFormatToggleResult {
  readonly markdown: string;
  readonly selection: MarkdownSelection;
}

interface LineSpan {
  readonly start: number;
  readonly contentEnd: number;
  readonly text: string;
}

interface Replacement {
  readonly start: number;
  readonly removeLength: number;
  readonly insert: string;
  readonly mapCollapsedAtBoundary?: "after" | "before";
}

const BLOCK_QUOTE_PREFIX = /^([ \t]{0,3}>[ \t]?)/;

export function markdownBlockFormatState(markdown: string, selection: MarkdownSelection): BlockFormatState {
  const normalized = normalizeSelection(markdown, selection);
  const lines = selectedLineSpans(markdown, normalized);

  return {
    quote: lines.length > 0 && lines.every((line) => blockQuotePrefixLength(line.text) !== 0)
  };
}

export function toggleMarkdownBlockQuote(markdown: string, selection: MarkdownSelection): BlockFormatToggleResult {
  const normalized = normalizeSelection(markdown, selection);
  const lines = selectedLineSpans(markdown, normalized);
  const removeQuote = lines.length > 0 && lines.every((line) => blockQuotePrefixLength(line.text) !== 0);
  const replacements = removeQuote
    ? removeBlockQuoteReplacements(lines)
    : addBlockQuoteReplacements(markdown, lines);

  const mappedStart = normalized.start === normalized.end
    ? mapCollapsedOffset(normalized.start, replacements)
    : mapOffset(normalized.start, replacements, 1);
  const mappedEnd = normalized.start === normalized.end
    ? mappedStart
    : mapOffset(normalized.end, replacements, -1);

  return {
    markdown: applyReplacements(markdown, replacements),
    selection: {
      start: mappedStart,
      end: mappedEnd
    }
  };
}

function addBlockQuoteReplacements(markdown: string, lines: readonly LineSpan[]): readonly Replacement[] {
  const replacements = lines
    .filter((line) => blockQuotePrefixLength(line.text) === 0)
    .map((line) => ({
      start: line.start,
      removeLength: 0,
      insert: "> ",
      mapCollapsedAtBoundary: "after" as const
    }));
  const termination = blockQuoteTerminationReplacement(markdown, lines);

  return termination === null ? replacements : [...replacements, termination];
}

function removeBlockQuoteReplacements(lines: readonly LineSpan[]): readonly Replacement[] {
  return lines.map((line) => ({
    start: line.start,
    removeLength: blockQuotePrefixLength(line.text),
    insert: ""
  }));
}

function selectedLineSpans(markdown: string, selection: MarkdownSelection): readonly LineSpan[] {
  const start = lineStartAt(markdown, selection.start);
  const effectiveEnd = selection.end > selection.start && markdown[selection.end - 1] === "\n"
    ? selection.end - 1
    : selection.end;
  const lines: LineSpan[] = [];
  let lineStart = start;

  do {
    const newline = markdown.indexOf("\n", lineStart);
    const contentEnd = newline === -1 ? markdown.length : newline;
    lines.push({
      start: lineStart,
      contentEnd,
      text: markdown.slice(lineStart, contentEnd)
    });
    if (newline === -1 || contentEnd >= effectiveEnd) break;
    lineStart = newline + 1;
  } while (lineStart <= markdown.length);

  return lines;
}

function lineStartAt(markdown: string, offset: number): number {
  if (markdown.length === 0) return 0;
  const clamped = clamp(offset, 0, markdown.length);
  return markdown.lastIndexOf("\n", Math.max(0, clamped - 1)) + 1;
}

function blockQuotePrefixLength(line: string): number {
  return BLOCK_QUOTE_PREFIX.exec(line)?.[1]?.length ?? 0;
}

function blockQuoteTerminationReplacement(markdown: string, lines: readonly LineSpan[]): Replacement | null {
  const last = lines.at(-1);
  if (last === undefined || markdown[last.contentEnd] !== "\n") return null;

  const nextLineStart = last.contentEnd + 1;
  if (nextLineStart >= markdown.length) return null;

  const nextLineEnd = markdown.indexOf("\n", nextLineStart);
  const nextLine = markdown.slice(nextLineStart, nextLineEnd === -1 ? markdown.length : nextLineEnd);
  if (nextLine.trim().length === 0 || blockQuotePrefixLength(nextLine) !== 0) return null;

  return {
    start: last.contentEnd,
    removeLength: 0,
    insert: "\n",
    mapCollapsedAtBoundary: "before"
  };
}

function applyReplacements(markdown: string, replacements: readonly Replacement[]): string {
  let result = "";
  let cursor = 0;
  for (const replacement of replacements) {
    result += markdown.slice(cursor, replacement.start);
    result += replacement.insert;
    cursor = replacement.start + replacement.removeLength;
  }
  return result + markdown.slice(cursor);
}

function mapOffset(offset: number, replacements: readonly Replacement[], assoc: -1 | 1): number {
  let delta = 0;
  for (const replacement of replacements) {
    if (offset < replacement.start) break;
    if (offset === replacement.start && replacement.removeLength === 0) {
      if (assoc < 0) break;
      delta += replacement.insert.length;
      continue;
    }

    const removedEnd = replacement.start + replacement.removeLength;
    if (offset <= removedEnd) {
      return replacement.start + delta + replacement.insert.length;
    }

    delta += replacement.insert.length - replacement.removeLength;
  }
  return offset + delta;
}

function mapCollapsedOffset(offset: number, replacements: readonly Replacement[]): number {
  let delta = 0;
  for (const replacement of replacements) {
    if (offset < replacement.start) break;
    if (offset === replacement.start && replacement.removeLength === 0) {
      if (replacement.mapCollapsedAtBoundary === "before") break;
      delta += replacement.insert.length;
      continue;
    }

    const removedEnd = replacement.start + replacement.removeLength;
    if (offset <= removedEnd) {
      return replacement.start + delta + replacement.insert.length;
    }

    delta += replacement.insert.length - replacement.removeLength;
  }
  return offset + delta;
}

function normalizeSelection(markdown: string, selection: MarkdownSelection): MarkdownSelection {
  const start = clamp(Math.min(selection.start, selection.end), 0, markdown.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, markdown.length);
  return { start, end };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
