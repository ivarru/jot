export type EditorMode = "wysiwyg" | "text";

interface EditorModeShortcutEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly isComposing?: boolean;
}

export const EDITOR_MODE_TOGGLE_SHORTCUT_LABEL = "Ctrl/Cmd+Shift+M";
export const EDITOR_MODE_TOGGLE_ARIA_SHORTCUTS = "Control+Shift+M Meta+Shift+M";

export function nextEditorMode(mode: EditorMode): EditorMode {
  return mode === "wysiwyg" ? "text" : "wysiwyg";
}

export function isEditorModeToggleShortcut(event: EditorModeShortcutEvent): boolean {
  return (
    event.key.toLowerCase() === "m" &&
    event.shiftKey &&
    !event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    event.isComposing !== true
  );
}
