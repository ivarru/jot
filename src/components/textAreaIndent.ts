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
  onChange: (markdown: string) => void,
  onCursorChange?: (offset: number) => void
): boolean {
  const action = textAreaStructuralTabAction(element.value, element.selectionStart, element.selectionEnd, shiftKey);
  if (action.type === "noop") {
    onCursorChange?.(element.selectionStart);
    return true;
  }

  const inputFired = applyUndoableTextAreaReplacement(element, action.edit);
  onCursorChange?.(element.selectionStart);
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

    if (heading.depth >= 6) return { type: "noop" };
    return replace(line.start + heading.markerStart, line.start + heading.markerStart, "#", selectionStart, selectionEnd);
  }

  if (shiftKey) return { type: "noop" };

  const insertionOffset = line.start + Math.min(leadingSpaceCount(lineText), 3);
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
  const match = lineText.match(/^( *)(?:[*+-]|\d+[.)])([ \t]+|$)/);
  if (match === null) return null;
  const indentation = match[1] ?? "";
  return {
    indentationLength: indentation.length,
    markerEnd: match[0].length
  };
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

function leadingSpaceCount(value: string): number {
  return value.match(/^ */)?.[0].length ?? 0;
}
