import {
  shortcutLabelsForPlatform,
  isEditorModeToggleShortcut,
  isLinkEditShortcut,
  isTagInsertShortcut,
  nextEditorMode
} from "./editorModeShortcut";

describe("editor mode shortcut", () => {
  it("toggles between WYSIWYG and text modes", () => {
    expect(nextEditorMode("wysiwyg")).toBe("text");
    expect(nextEditorMode("text")).toBe("wysiwyg");
  });

  it("uses Ctrl/Cmd+Shift+M", () => {
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
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true }))).toBe(true);
    expect(isLinkEditShortcut(keyboardEvent({ key: "K", metaKey: true }))).toBe(true);
  });

  it("ignores nearby link editing shortcuts and composing input", () => {
    expect(isLinkEditShortcut(keyboardEvent({ key: "k" }))).toBe(false);
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true, altKey: true }))).toBe(false);
    expect(isLinkEditShortcut(keyboardEvent({ key: "k", ctrlKey: true, isComposing: true }))).toBe(false);
  });

  it("uses Ctrl+Alt+K or Cmd+Option+K for tag insertion", () => {
    expect(isTagInsertShortcut(keyboardEvent({ key: "k", code: "KeyK", ctrlKey: true, altKey: true }))).toBe(true);
    expect(isTagInsertShortcut(keyboardEvent({ key: "˚", code: "KeyK", metaKey: true, altKey: true }))).toBe(true);
    expect(isTagInsertShortcut(keyboardEvent({ key: "k", code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true }))).toBe(false);
    expect(isTagInsertShortcut(keyboardEvent({
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      altKey: true,
      isComposing: true
    }))).toBe(false);
  });

  it("shows only shortcuts for the current platform", () => {
    expect(shortcutLabelsForPlatform("MacIntel")).toEqual({
      editorModeToggle: "Cmd+Shift+M",
      linkEdit: "Cmd+K",
      tagInsert: "Cmd+Option+K",
      undo: "Cmd+Z",
      redo: "Cmd+Shift+Z"
    });
    expect(shortcutLabelsForPlatform("Win32")).toEqual({
      editorModeToggle: "Ctrl+Shift+M",
      linkEdit: "Ctrl+K",
      tagInsert: "Ctrl+Alt+K",
      undo: "Ctrl+Z",
      redo: "Ctrl+Shift+Z"
    });
  });
});

function keyboardEvent(
  overrides: Partial<Parameters<typeof isEditorModeToggleShortcut>[0]>
): Parameters<typeof isEditorModeToggleShortcut>[0] {
  return {
    key: "x",
    code: "KeyX",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides
  };
}
