import {
  EDITOR_MODE_TOGGLE_SHORTCUT_LABEL,
  LINK_EDIT_SHORTCUT_LABEL,
  isEditorModeToggleShortcut,
  isLinkEditShortcut,
  nextEditorMode
} from "./editorModeShortcut";

describe("editor mode shortcut", () => {
  it("toggles between WYSIWYG and text modes", () => {
    expect(nextEditorMode("wysiwyg")).toBe("text");
    expect(nextEditorMode("text")).toBe("wysiwyg");
  });

  it("uses Ctrl/Cmd+Shift+M", () => {
    expect(EDITOR_MODE_TOGGLE_SHORTCUT_LABEL).toBe("Ctrl/Cmd+Shift+M");
    expect(isEditorModeToggleShortcut(keyboardEvent({ key: "m", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isEditorModeToggleShortcut(keyboardEvent({ key: "M", metaKey: true, shiftKey: true }))).toBe(true);
  });

  it("ignores nearby shortcuts and composing input", () => {
    expect(isEditorModeToggleShortcut(keyboardEvent({ key: "m", ctrlKey: true }))).toBe(false);
    expect(isEditorModeToggleShortcut(keyboardEvent({ key: "m", ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
    expect(
      isEditorModeToggleShortcut(keyboardEvent({ key: "m", ctrlKey: true, shiftKey: true, isComposing: true }))
    ).toBe(false);
  });

  it("uses Ctrl/Cmd+K for link editing", () => {
    expect(LINK_EDIT_SHORTCUT_LABEL).toBe("Ctrl/Cmd+K");
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true }))).toBe(true);
    expect(isLinkEditShortcut(keyboardEvent({ key: "K", metaKey: true }))).toBe(true);
  });

  it("ignores nearby link editing shortcuts and composing input", () => {
    expect(isLinkEditShortcut(keyboardEvent({ key: "k" }))).toBe(false);
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true, altKey: true }))).toBe(false);
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true, isComposing: true }))).toBe(false);
  });
});

function keyboardEvent(
  overrides: Partial<Parameters<typeof isEditorModeToggleShortcut>[0]>
): Parameters<typeof isEditorModeToggleShortcut>[0] {
  return {
    key: "x",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides
  };
}
