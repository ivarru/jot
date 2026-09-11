import {
  availableStructuralTabs,
  structuralHeadingAvailability,
  structuralHeadingTarget,
  type StructuralTabAvailability
} from "../editor/structuralHeading";
import { createMarkdownProtectedLineScanner } from "../domain/dailyNoteMarkdown";

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
    const target = structuralHeadingTarget(heading.depth, previousHeadingDepth(markdown, line.start), shiftKey);
    if (target.type === "noop") return { type: "noop" };
    if (target.type === "paragraph") {
      const end = heading.markerStart + heading.markers.length + heading.separator.length;
      return replace(line.start + heading.markerStart, line.start + end, "", selectionStart, selectionEnd);
    }
    if (target.type !== "heading") return { type: "noop" };
    return replaceHeadingMarkers(line, heading, target.level, selectionStart, selectionEnd);
  }

  if (isGfmTableLine(markdown, line)) return { type: "noop" };

  const insertionOffset = line.start + Math.min(leadingSpaceCount(lineText), 3);
  if (shiftKey) {
    const target = structuralHeadingTarget(null, previousHeadingDepth(markdown, line.start), true);
    if (target.type !== "heading") return { type: "noop" };
    return replace(insertionOffset, insertionOffset, `${"#".repeat(target.level)} `, selectionStart, selectionEnd);
  }

  return replace(insertionOffset, insertionOffset, "* ", selectionStart, selectionEnd);
}

export function textAreaStructuralTabAvailability(markdown: string, selectionStart: number): StructuralTabAvailability {
  const line = currentLine(markdown, selectionStart);
  const lineText = markdown.slice(line.start, line.end);
  if (listItemPrefix(lineText) !== null || isCodeBlockContentLine(markdown, line.start, lineText) || isGfmTableLine(markdown, line)) {
    return availableStructuralTabs;
  }
  const heading = headingPrefix(lineText);
  return structuralHeadingAvailability(heading?.depth ?? null, previousHeadingDepth(markdown, line.start));
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

function replaceHeadingMarkers(
  line: CurrentLine,
  heading: HeadingPrefix,
  targetLevel: number,
  selectionStart: number,
  selectionEnd: number
): TextAreaStructuralTabAction {
  return replace(
    line.start + heading.markerStart,
    line.start + heading.markerStart + heading.markers.length,
    "#".repeat(targetLevel),
    selectionStart,
    selectionEnd
  );
}

function mapSelectionOffset(offset: number, start: number, end: number, replacementLength: number): number {
  if (start === end) return offset < start ? offset : offset + replacementLength;
  if (offset <= start) return offset;
  if (offset >= end) return offset + replacementLength - (end - start);
  return start + replacementLength;
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

function previousHeadingDepth(markdown: string, lineStart: number): number | null {
  let headingDepth: number | null = null;
  let previousLineText: string | null = null;
  const isProtected = createMarkdownProtectedLineScanner();
  for (const lineText of markdown.slice(0, lineStart).split("\n")) {
    if (isProtected(lineText)) {
      previousLineText = null;
      continue;
    }
    const setextDepth = setextHeadingDepth(lineText, previousLineText);
    if (setextDepth !== null) headingDepth = setextDepth;
    const heading = headingPrefix(lineText);
    if (heading !== null) headingDepth = heading.depth;
    previousLineText = lineText;
  }
  return headingDepth;
}

function setextHeadingDepth(underline: string, content: string | null): number | null {
  if (content === null || !isSetextHeadingContentLine(content)) return null;
  const match = underline.match(/^ {0,3}(=+|-+)[ \t]*$/);
  if (match === null) return null;
  return match[1]?.startsWith("=") ? 1 : 2;
}

function isSetextHeadingContentLine(lineText: string): boolean {
  if (/^[ \t]*$/.test(lineText) || /^ {4}/.test(lineText) || /^ {0,3}>/.test(lineText)) return false;
  if (listItemPrefix(lineText) !== null || headingPrefix(lineText) !== null) return false;
  if (openingFence(lineText) !== null || isThematicBreakLine(lineText)) return false;
  return true;
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
