import type { MarkdownSelection } from "./markdownSelection";

export interface ListItemFormatState {
  readonly task: boolean;
}

export const inactiveListItemFormatState: ListItemFormatState = {
  task: false
};

export interface ListItemFormatToggleResult {
  readonly markdown: string;
  readonly selection: MarkdownSelection;
}

interface LineSpan {
  readonly start: number;
  readonly contentEnd: number;
  readonly text: string;
}

interface ListItemLine {
  readonly line: LineSpan;
  readonly prefixEnd: number;
  readonly taskMarkerStart: number | null;
  readonly taskMarkerEnd: number | null;
}

interface Replacement {
  readonly start: number;
  readonly removeLength: number;
  readonly insert: string;
}

const BULLET_LIST_PREFIX = /^([ \t]*[*+-])([ \t]+)(?:(\[[ xX]\])([ \t]*))?/;

export function markdownListItemFormatState(markdown: string, selection: MarkdownSelection): ListItemFormatState {
  const normalized = normalizeSelection(markdown, selection);
  const lines = selectedLineSpans(markdown, normalized);

  return {
    task: lines.length > 0 && lines.every((line) => {
      const listItem = parseListItemLine(line);
      return listItem !== null && listItem.taskMarkerStart !== null;
    })
  };
}

export function toggleMarkdownTaskListItem(
  markdown: string,
  selection: MarkdownSelection
): ListItemFormatToggleResult | null {
  const normalized = normalizeSelection(markdown, selection);
  const lines = selectedLineSpans(markdown, normalized);
  const targets = lines.map((line) => ({
    line,
    listItem: parseListItemLine(line)
  }));

  const replacements = targets.every((target) => target.listItem !== null && target.listItem.taskMarkerStart !== null)
    ? removeTaskListReplacements(targets.map((target) => target.listItem!))
    : addTaskListReplacements(targets);
  if (replacements.length === 0) return null;

  const mappedStart = mapOffset(normalized.start, replacements, 1);
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

function addTaskListReplacements(
  targets: readonly {
    readonly line: LineSpan;
    readonly listItem: ListItemLine | null;
  }[]
): readonly Replacement[] {
  return targets.flatMap((target) => {
    if (target.listItem === null) {
      return [{
        start: target.line.start + Math.min(leadingSpaceCount(target.line.text), 3),
        removeLength: 0,
        insert: "* [ ] "
      }];
    }

    if (target.listItem.taskMarkerStart !== null) return [];
    return [{
      start: target.listItem.line.start + target.listItem.prefixEnd,
      removeLength: 0,
      insert: "[ ] "
    }];
  });
}

function removeTaskListReplacements(listItems: readonly ListItemLine[]): readonly Replacement[] {
  return listItems.map((item) => ({
    start: item.line.start + item.taskMarkerStart!,
    removeLength: item.taskMarkerEnd! - item.taskMarkerStart!,
    insert: ""
  }));
}

function parseListItemLine(line: LineSpan): ListItemLine | null {
  const match = BULLET_LIST_PREFIX.exec(line.text);
  if (match === null) return null;

  const bulletAndIndent = match[1] ?? "";
  const markerWhitespace = match[2] ?? "";
  const taskMarker = match[3] ?? null;
  const taskWhitespace = match[4] ?? "";
  const prefixEnd = bulletAndIndent.length + markerWhitespace.length;
  const taskMarkerStart = taskMarker === null ? null : prefixEnd;
  const taskMarkerEnd = taskMarker === null ? null : prefixEnd + taskMarker.length + taskWhitespace.length;

  return {
    line,
    prefixEnd,
    taskMarkerStart,
    taskMarkerEnd
  };
}

function leadingSpaceCount(value: string): number {
  let count = 0;
  while (value[count] === " ") count += 1;
  return count;
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

function normalizeSelection(markdown: string, selection: MarkdownSelection): MarkdownSelection {
  const start = clamp(Math.min(selection.start, selection.end), 0, markdown.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, markdown.length);
  return { start, end };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
