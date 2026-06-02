const TAB_INDENT = "  ";

export function shouldInsertTextAreaTabIndent(event: KeyboardEvent): boolean {
  return event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
}

export function insertTextAreaTabIndent(
  element: HTMLTextAreaElement,
  onChange: (markdown: string) => void,
  onCursorChange?: (offset: number) => void
): void {
  const end = element.selectionEnd;
  element.setRangeText(TAB_INDENT, end, end, "end");
  onCursorChange?.(element.selectionStart);
  onChange(element.value);
}
