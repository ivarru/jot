const STRUCTURAL_INDENT = "  ";

export interface TextAreaStructuralTabEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export type TextAreaStructuralTabAction =
  | {
      readonly type: "edit";
      readonly edit: TextAreaStructuralTabEdit;
    }
  | {
      readonly type: "noop";
    };

export function shouldHandleTextAreaStructuralTab(event: KeyboardEvent): boolean {
  return (
    event.key === "Tab" &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

export function applyTextAreaStructuralTab(
  element: HTMLTextAreaElement,
  shiftKey: boolean,
  onChange: (markdown: string) => void
): boolean {
  const action = textAreaStructuralTabAction(element.value, element.selectionStart, element.selectionEnd, shiftKey);
  if (action.type === "noop") return true;

  const inputFired = applyUndoableTextAreaReplacement(element, action.edit);
  if (!inputFired) {
    onChange(element.value);
  }
  return true;
}

export function textAreaStructuralTabAction(
  markdown: string,
  selectionStart: number,
  selectionEnd: number,
  shiftKey: boolean
): TextAreaStructuralTabAction {
  const line = currentLine(markdown, selectionStart);
  const lineText = markdown.slice(line.start, line.end);
  const listItem = listItemPrefix(lineText);

  if (listItem !== null) {
    if (shiftKey) {
      if (listItem.indentationLength > 0) {
        const removeCount = Math.min(STRUCTURAL_INDENT.length, listItem.indentationLength);
        return replace(line.start, line.start + removeCount, "", selectionStart, selectionEnd);
      }

      return replace(line.start, line.start + listItem.markerEnd, "", selectionStart, selectionEnd);
    }

    return replace(line.start, line.start, STRUCTURAL_INDENT, selectionStart, selectionEnd);
  }

  if (isCodeBlockContentLine(markdown, line.start, lineText)) {
    if (shiftKey) {
      const removeCount = Math.min(STRUCTURAL_INDENT.length, leadingSpaceCount(lineText));
      if (removeCount === 0) return { type: "noop" };
      return replace(line.start, line.start + removeCount, "", selectionStart, selectionEnd);
    }

    return replace(line.start, line.start, STRUCTURAL_INDENT, selectionStart, selectionEnd);
  }

  const heading = headingPrefix(lineText);
  if (heading !== null) {
    if (shiftKey) {
      if (heading.depth >= 6) return { type: "noop" };
      return replace(line.start + heading.markerStart, line.start + heading.markerStart, "#", selectionStart, selectionEnd);
    }

    if (heading.depth === 1) {
      const end = heading.markerStart + heading.markers.length + heading.separator.length;
      return replace(line.start + heading.markerStart, line.start + end, "", selectionStart, selectionEnd);
    }

    return replace(
      line.start + heading.markerStart,
      line.start + heading.markerStart + 1,
      "",
      selectionStart,
      selectionEnd
    );
  }

  if (isGfmTableLine(markdown, line)) return { type: "noop" };

  const insertionOffset = line.start + Math.min(leadingSpaceCount(lineText), 3);
  if (shiftKey) return replace(insertionOffset, insertionOffset, "# ", selectionStart, selectionEnd);

  const paragraph = paragraphLineSpan(markdown, line);
  if (paragraph !== null && paragraph.lines.length > 1) {
    return replaceParagraphWithListItem(markdown, paragraph, selectionStart, selectionEnd);
  }

  return replace(insertionOffset, insertionOffset, "* ", selectionStart, selectionEnd);
}

interface CurrentLine {
  readonly start: number;
  readonly end: number;
}

interface HeadingPrefix {
  readonly markerStart: number;
  readonly markers: string;
  readonly separator: string;
  readonly depth: number;
}

interface ListItemPrefix {
  readonly indentationLength: number;
  readonly markerEnd: number;
}

interface FenceState {
  readonly marker: "`" | "~";
  readonly length: number;
}

interface ParagraphLineSpan {
  readonly start: number;
  readonly end: number;
  readonly lines: readonly CurrentLine[];
}

interface OffsetInsertion {
  readonly offset: number;
  readonly length: number;
}

function applyUndoableTextAreaReplacement(element: HTMLTextAreaElement, edit: TextAreaStructuralTabEdit): boolean {
  const expectedValue = `${element.value.slice(0, edit.start)}${edit.replacement}${element.value.slice(edit.end)}`;
  let inputFired = false;
  const inputListener = () => {
    inputFired = true;
  };

  element.addEventListener("input", inputListener);
  element.focus();
  element.setSelectionRange(edit.start, edit.end);
  try {
    document.execCommand("insertText", false, edit.replacement);
  } catch {
    // Some test environments expose execCommand but do not implement insertText.
  }
  element.removeEventListener("input", inputListener);

  if (element.value !== expectedValue) {
    inputFired = false;
    element.setSelectionRange(edit.start, edit.end);
    element.setRangeText(edit.replacement, edit.start, edit.end, "preserve");
  }

  element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  return inputFired;
}

function replaceParagraphWithListItem(
  markdown: string,
  paragraph: ParagraphLineSpan,
  selectionStart: number,
  selectionEnd: number
): TextAreaStructuralTabAction {
  const insertions: OffsetInsertion[] = [];
  let replacement = "";
  let previousLine: CurrentLine | null = null;

  paragraph.lines.forEach((line, index) => {
    if (previousLine !== null) {
      replacement += markdown.slice(previousLine.end, line.start);
    }

    const lineText = markdown.slice(line.start, line.end);
    if (index === 0) {
      const prefixOffset = line.start + Math.min(leadingSpaceCount(lineText), 3);
      const relativePrefixOffset = prefixOffset - line.start;
      replacement += `${lineText.slice(0, relativePrefixOffset)}* ${lineText.slice(relativePrefixOffset)}`;
      insertions.push({ offset: prefixOffset, length: "* ".length });
    } else {
      replacement += `${STRUCTURAL_INDENT}${lineText}`;
      insertions.push({ offset: line.start, length: STRUCTURAL_INDENT.length });
    }

    previousLine = line;
  });

  const delta = replacement.length - (paragraph.end - paragraph.start);

  return {
    type: "edit",
    edit: {
      start: paragraph.start,
      end: paragraph.end,
      replacement,
      selectionStart: mapOffsetThroughInsertions(selectionStart, paragraph.start, paragraph.end, insertions, delta),
      selectionEnd: mapOffsetThroughInsertions(selectionEnd, paragraph.start, paragraph.end, insertions, delta)
    }
  };
}

function replace(
  start: number,
  end: number,
  replacement: string,
  selectionStart: number,
  selectionEnd: number
): TextAreaStructuralTabAction {
  return {
    type: "edit",
    edit: {
      start,
      end,
      replacement,
      selectionStart: mapSelectionOffset(selectionStart, start, end, replacement.length),
      selectionEnd: mapSelectionOffset(selectionEnd, start, end, replacement.length)
    }
  };
}

function mapSelectionOffset(offset: number, start: number, end: number, replacementLength: number): number {
  if (start === end) return offset < start ? offset : offset + replacementLength;
  if (offset <= start) return offset;
  if (offset >= end) return offset + replacementLength - (end - start);
  return start + replacementLength;
}

function mapOffsetThroughInsertions(
  offset: number,
  editStart: number,
  editEnd: number,
  insertions: readonly OffsetInsertion[],
  delta: number
): number {
  if (offset < editStart) return offset;
  if (offset > editEnd) return offset + delta;

  return insertions.reduce((mapped, insertion) => {
    return offset >= insertion.offset ? mapped + insertion.length : mapped;
  }, offset);
}

function currentLine(markdown: string, offset: number): CurrentLine {
  const clampedOffset = Math.max(0, Math.min(markdown.length, offset));
  const start = markdown.slice(0, clampedOffset).lastIndexOf("\n") + 1;
  const nextLineBreak = markdown.indexOf("\n", clampedOffset);
  return {
    start,
    end: nextLineBreak === -1 ? markdown.length : nextLineBreak
  };
}

function listItemPrefix(lineText: string): ListItemPrefix | null {
  const match = lineText.match(/^( *)(?:[*+-]|\d+[.)])(?:[ \t]+\[[ xX]\])?([ \t]+|$)/);
  if (match === null) return null;
  const indentation = match[1] ?? "";
  return {
    indentationLength: indentation.length,
    markerEnd: match[0].length
  };
}

function paragraphLineSpan(markdown: string, line: CurrentLine): ParagraphLineSpan | null {
  if (!isParagraphLine(markdown, line)) return null;

  const lines = [line];
  let previous = previousLine(markdown, line.start);
  while (previous !== null && isParagraphLine(markdown, previous)) {
    lines.unshift(previous);
    previous = previousLine(markdown, previous.start);
  }

  let next = nextLine(markdown, line.end);
  while (next !== null && isParagraphLine(markdown, next)) {
    lines.push(next);
    next = nextLine(markdown, next.end);
  }

  return {
    start: lines[0]?.start ?? line.start,
    end: lines.at(-1)?.end ?? line.end,
    lines
  };
}

function previousLine(markdown: string, lineStart: number): CurrentLine | null {
  if (lineStart <= 0) return null;

  const end = lineStart - 1;
  const start = markdown.lastIndexOf("\n", Math.max(0, end - 1)) + 1;
  return { start, end };
}

function nextLine(markdown: string, lineEnd: number): CurrentLine | null {
  if (lineEnd >= markdown.length) return null;

  const start = lineEnd + 1;
  const nextLineBreak = markdown.indexOf("\n", start);
  return {
    start,
    end: nextLineBreak === -1 ? markdown.length : nextLineBreak
  };
}

function isParagraphLine(markdown: string, line: CurrentLine): boolean {
  const lineText = markdown.slice(line.start, line.end);
  if (/^[ \t]*$/.test(lineText)) return false;
  if (/^ {0,3}>/.test(lineText)) return false;
  if (listItemPrefix(lineText) !== null) return false;
  if (headingPrefix(lineText) !== null) return false;
  if (openingFence(lineText) !== null) return false;
  if (isThematicBreakLine(lineText)) return false;
  if (isGfmTableLine(markdown, line)) return false;
  if (isCodeBlockContentLine(markdown, line.start, lineText)) return false;
  return true;
}

function isGfmTableLine(markdown: string, line: CurrentLine): boolean {
  const lineText = markdown.slice(line.start, line.end);
  if (tableCells(lineText) === null) return false;

  if (isTableDelimiterLine(lineText)) {
    const previous = previousLine(markdown, line.start);
    return previous !== null && isTableDataLine(markdown.slice(previous.start, previous.end));
  }

  const next = nextLine(markdown, line.end);
  if (next !== null && isTableDelimiterLine(markdown.slice(next.start, next.end))) return true;

  let previous = previousLine(markdown, line.start);
  while (previous !== null) {
    const previousText = markdown.slice(previous.start, previous.end);
    if (isTableDelimiterLine(previousText)) return true;
    if (!isTableDataLine(previousText)) return false;
    previous = previousLine(markdown, previous.start);
  }

  return false;
}

function isTableDataLine(lineText: string): boolean {
  return tableCells(lineText) !== null && !isTableDelimiterLine(lineText);
}

function isTableDelimiterLine(lineText: string): boolean {
  const cells = tableCells(lineText);
  return cells !== null && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function tableCells(lineText: string): readonly string[] | null {
  const trimmed = lineText.trim();
  if (!trimmed.includes("|")) return null;

  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const normalized = withoutLeadingPipe.endsWith("|") ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe;
  const cells = normalized.split("|");
  return cells.length >= 2 ? cells : null;
}

function isCodeBlockContentLine(markdown: string, lineStart: number, lineText: string): boolean {
  const fence = fenceStateBeforeLine(markdown, lineStart);
  if (fence !== null) return !isClosingFenceLine(lineText, fence);
  return leadingSpaceCount(lineText) >= 4;
}

function headingPrefix(lineText: string): HeadingPrefix | null {
  const match = lineText.match(/^([ \t]{0,3})(#{1,6})([ \t]+|$)/);
  if (match === null) return null;

  const indentation = match[1] ?? "";
  const markers = match[2] ?? "";
  return {
    markerStart: indentation.length,
    markers,
    separator: match[3] ?? "",
    depth: markers.length
  };
}

function fenceStateBeforeLine(markdown: string, lineStart: number): FenceState | null {
  const previousLines = markdown.slice(0, lineStart).split("\n");
  if (previousLines.at(-1) === "") previousLines.pop();

  let fence: FenceState | null = null;
  for (const line of previousLines) {
    if (fence === null) {
      fence = openingFence(line);
    } else if (isClosingFenceLine(line, fence)) {
      fence = null;
    }
  }
  return fence;
}

function openingFence(lineText: string): FenceState | null {
  const match = lineText.match(/^ {0,3}(`{3,}|~{3,})/);
  if (match === null) return null;
  const fence = match[1] ?? "";
  return {
    marker: fence.startsWith("`") ? "`" : "~",
    length: fence.length
  };
}

function isClosingFenceLine(lineText: string, fence: FenceState): boolean {
  const escapedMarker = fence.marker === "`" ? "`" : "~";
  const pattern = new RegExp(`^ {0,3}${escapedMarker}{${fence.length},}[ \\t]*$`);
  return pattern.test(lineText);
}

function isThematicBreakLine(lineText: string): boolean {
  return (
    /^ {0,3}(?:\*[ \t]*){3,}$/.test(lineText) ||
    /^ {0,3}(?:-[ \t]*){3,}$/.test(lineText) ||
    /^ {0,3}(?:_[ \t]*){3,}$/.test(lineText)
  );
}

function leadingSpaceCount(value: string): number {
  return value.match(/^ */)?.[0].length ?? 0;
}
