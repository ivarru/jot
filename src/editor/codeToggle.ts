import type { MarkdownSelection } from "./markdownSelection";

export interface CodeToggleResult {
  readonly markdown: string;
  readonly selection: MarkdownSelection;
}

interface CodeRange {
  readonly kind: "inline" | "fenced";
  readonly markerStart: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly markerEnd: number;
}

export function toggleCodeFormat(markdown: string, selection: MarkdownSelection): CodeToggleResult {
  const normalized = normalizeSelection(markdown, selection);
  if (normalized.start === normalized.end) {
    const emptyCodeRange = emptyInlineCodeRangeContainingCursor(markdown, normalized.start);
    if (emptyCodeRange !== null) return removeCodeFormatAtCursor(markdown, normalized.start, emptyCodeRange);
    if (codeRangeContainingCursor(markdown, normalized.start) !== null) {
      return {
        markdown,
        selection: normalized
      };
    }
    return insertInlineCodeMarkers(markdown, normalized.start);
  }

  const codeRange = codeRangeContainingSelection(markdown, normalized);
  if (codeRange !== null) return removeCodeFormat(markdown, normalized, codeRange);

  return addCodeFormat(markdown, normalized);
}

function insertInlineCodeMarkers(markdown: string, offset: number): CodeToggleResult {
  return {
    markdown: replaceRange(markdown, offset, offset, "``"),
    selection: {
      start: offset + 1,
      end: offset + 1
    }
  };
}

function addCodeFormat(markdown: string, selection: MarkdownSelection): CodeToggleResult {
  const selected = markdown.slice(selection.start, selection.end);
  if (selected.includes("\n")) return addFencedCodeFormat(markdown, selection, selected);

  const replacement = inlineCodeSpan(selected);
  const padding = inlineCodePadding(selected);
  const contentStart = selection.start + inlineMarkerLength(selected) + padding;

  return {
    markdown: replaceRange(markdown, selection.start, selection.end, replacement),
    selection: {
      start: contentStart,
      end: contentStart + selected.length
    }
  };
}

function addFencedCodeFormat(markdown: string, selection: MarkdownSelection, selected: string): CodeToggleResult {
  const leadingBreak = selection.start > 0 && markdown[selection.start - 1] !== "\n" ? "\n" : "";
  const trailingBreak = selection.end < markdown.length && markdown[selection.end] !== "\n" ? "\n" : "";
  const replacement = `${leadingBreak}${fencedCodeBlock(selected)}${trailingBreak}`;
  const contentStart = selection.start + leadingBreak.length + openingFenceLength(selected);

  return {
    markdown: replaceRange(markdown, selection.start, selection.end, replacement),
    selection: {
      start: contentStart,
      end: contentStart + selected.length
    }
  };
}

function removeCodeFormat(markdown: string, selection: MarkdownSelection, range: CodeRange): CodeToggleResult {
  if (range.kind === "fenced") return removeFencedCodeFormat(markdown, selection, range);
  return removeInlineCodeFormat(markdown, selection, range);
}

function removeCodeFormatAtCursor(markdown: string, offset: number, range: CodeRange): CodeToggleResult {
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

function removeInlineCodeFormat(markdown: string, selection: MarkdownSelection, range: CodeRange): CodeToggleResult {
  const selected = markdown.slice(selection.start, selection.end);
  const prefix = markdown.slice(range.contentStart, selection.start);
  const suffix = markdown.slice(selection.end, range.contentEnd);
  const replacementPrefix = prefix.length === 0 ? "" : inlineCodeSpan(prefix);
  const replacementSuffix = suffix.length === 0 ? "" : inlineCodeSpan(suffix);
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

function removeFencedCodeFormat(markdown: string, selection: MarkdownSelection, range: CodeRange): CodeToggleResult {
  const selected = markdown.slice(selection.start, selection.end);
  const prefix = markdown.slice(range.contentStart, selection.start);
  const suffix = markdown.slice(selection.end, range.contentEnd);
  const prefixBlock = fencedSplitPrefix(prefix);
  const suffixBlock = fencedSplitSuffix(suffix);
  const replacementPrefix = prefixBlock.length === 0 ? "" : `${fencedCodeBlock(prefixBlock)}\n`;
  const replacementSuffix = suffixBlock.length === 0 ? "" : `\n${fencedCodeBlock(suffixBlock)}`;
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

function codeRangeContainingSelection(markdown: string, selection: MarkdownSelection): CodeRange | null {
  return codeRanges(markdown).find((range) => selection.start >= range.contentStart && selection.end <= range.contentEnd) ?? null;
}

function codeRangeContainingCursor(markdown: string, offset: number): CodeRange | null {
  return codeRanges(markdown).find((range) => offset >= range.contentStart && offset <= range.contentEnd)
    ?? null;
}

function emptyInlineCodeRangeContainingCursor(markdown: string, offset: number): CodeRange | null {
  if (offset <= 0 || offset >= markdown.length) return null;
  if (markdown[offset - 1] !== "`" || markdown[offset] !== "`") return null;
  if (markdown[offset - 2] === "`" || markdown[offset + 1] === "`") return null;

  return {
    kind: "inline",
    markerStart: offset - 1,
    contentStart: offset,
    contentEnd: offset,
    markerEnd: offset + 1
  };
}

function codeRanges(markdown: string): CodeRange[] {
  const fenced = fencedCodeRanges(markdown);
  return [...fenced, ...inlineCodeRanges(markdown, fenced)].sort((left, right) => left.markerStart - right.markerStart);
}

function fencedCodeRanges(markdown: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  let active: {
    readonly markerStart: number;
    readonly contentStart: number;
    readonly fence: string;
  } | null = null;

  for (const line of markdownLines(markdown)) {
    if (active === null) {
      const opening = line.text.match(/^( {0,3})(`{3,}|~{3,})[^\n\r]*$/);
      if (opening === null) continue;

      active = {
        markerStart: line.start,
        contentStart: line.endWithBreak,
        fence: opening[2] ?? ""
      };
      continue;
    }

    if (!isClosingFence(line.text, active.fence)) continue;

    ranges.push({
      kind: "fenced",
      markerStart: active.markerStart,
      contentStart: active.contentStart,
      contentEnd: line.start > active.contentStart ? line.start - 1 : line.start,
      markerEnd: line.end
    });
    active = null;
  }

  return ranges;
}

function inlineCodeRanges(markdown: string, fencedRanges: readonly CodeRange[]): CodeRange[] {
  const ranges: CodeRange[] = [];
  let index = 0;

  while (index < markdown.length) {
    if (markdown[index] !== "`" || inAnyRange(index, fencedRanges)) {
      index += 1;
      continue;
    }

    const markerLength = countBackticks(markdown, index);
    const closingStart = findClosingBacktickRun(markdown, index + markerLength, markerLength, fencedRanges);
    if (closingStart === null) {
      index += markerLength;
      continue;
    }

    ranges.push({
      kind: "inline",
      markerStart: index,
      contentStart: index + markerLength,
      contentEnd: closingStart,
      markerEnd: closingStart + markerLength
    });
    index = closingStart + markerLength;
  }

  return ranges;
}

function findClosingBacktickRun(
  markdown: string,
  start: number,
  markerLength: number,
  fencedRanges: readonly CodeRange[]
): number | null {
  let index = start;
  while (index < markdown.length) {
    if (markdown[index] !== "`" || inAnyRange(index, fencedRanges)) {
      index += 1;
      continue;
    }

    const length = countBackticks(markdown, index);
    if (length === markerLength) return index;
    index += length;
  }

  return null;
}

function isClosingFence(line: string, fence: string): boolean {
  const character = fence[0] ?? "`";
  const escaped = character === "`" ? "`" : "~";
  const pattern = new RegExp(`^ {0,3}${escaped}{${fence.length},}[ \t]*$`);
  return pattern.test(line);
}

function inAnyRange(offset: number, ranges: readonly CodeRange[]): boolean {
  return ranges.some((range) => offset >= range.markerStart && offset < range.markerEnd);
}

interface MarkdownLine {
  readonly start: number;
  readonly end: number;
  readonly endWithBreak: number;
  readonly text: string;
}

function markdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let start = 0;

  while (start <= markdown.length) {
    const newline = markdown.indexOf("\n", start);
    const end = newline === -1 ? markdown.length : newline;
    const text = markdown.slice(start, end).replace(/\r$/, "");
    lines.push({
      start,
      end,
      endWithBreak: newline === -1 ? end : newline + 1,
      text
    });

    if (newline === -1) break;
    start = newline + 1;
  }

  return lines;
}

function inlineCodeSpan(value: string): string {
  const marker = "`".repeat(inlineMarkerLength(value));
  const padding = inlineCodePadding(value) === 1 ? " " : "";
  return `${marker}${padding}${value}${padding}${marker}`;
}

function fencedCodeBlock(value: string): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(value) + 1));
  return `${fence}\n${value}\n${fence}`;
}

function inlineMarkerLength(value: string): number {
  return longestBacktickRun(value) + 1;
}

function openingFenceLength(value: string): number {
  return Math.max(3, longestBacktickRun(value) + 1) + 1;
}

function inlineCodePadding(value: string): 0 | 1 {
  return value.startsWith("`") || value.endsWith("`") ? 1 : 0;
}

function longestBacktickRun(value: string): number {
  let longest = 0;
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "`") {
      index += 1;
      continue;
    }

    const length = countBackticks(value, index);
    longest = Math.max(longest, length);
    index += length;
  }

  return longest;
}

function countBackticks(value: string, start: number): number {
  let end = start;
  while (value[end] === "`") end += 1;
  return end - start;
}

function fencedSplitPrefix(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function fencedSplitSuffix(value: string): string {
  return value.startsWith("\n") ? value.slice(1) : value;
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
