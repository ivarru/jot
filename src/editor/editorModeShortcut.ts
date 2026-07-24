export type EditorMode = "wysiwyg" | "text";

interface EditorModeShortcutEvent {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly isComposing?: boolean;
}

export const EDITOR_MODE_TOGGLE_ARIA_SHORTCUTS = "Control+Shift+M Meta+Shift+M";
export const LINK_EDIT_ARIA_SHORTCUTS = "Control+K Meta+K";
export const TAG_INSERT_ARIA_SHORTCUTS = "Control+Alt+K Meta+Alt+K";

export interface EditorShortcutLabels {
  readonly editorModeToggle: string;
  readonly linkEdit: string;
  readonly tagInsert: string;
  readonly undo: string;
  readonly redo: string;
}

export function shortcutLabelsForPlatform(platform: string): EditorShortcutLabels {
  const isApple = /Mac|iPhone|iPad|iPod/i.test(platform);
  return isApple
    ? {
      editorModeToggle: "Cmd+Shift+M",
      linkEdit: "Cmd+K",
      tagInsert: "Cmd+Option+K",
      undo: "Cmd+Z",
      redo: "Cmd+Shift+Z"
    }
    : {
      editorModeToggle: "Ctrl+Shift+M",
      linkEdit: "Ctrl+K",
      tagInsert: "Ctrl+Alt+K",
      undo: "Ctrl+Z",
      redo: "Ctrl+Shift+Z"
    };
}

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

export function isLinkEditShortcut(event: EditorModeShortcutEvent): boolean {
  return (
    event.key.toLowerCase() === "k" &&
    !event.shiftKey &&
    !event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    event.isComposing !== true
  );
}

export function isTagInsertShortcut(event: EditorModeShortcutEvent): boolean {
  return (
    event.code === "KeyK" &&
    !event.shiftKey &&
    event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    event.isComposing !== true
  );
}
