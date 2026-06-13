import { render } from "solid-js/web";
import { todayIsoDate, type IsoDate } from "~/domain/dates";
import type { LocalDraft, SaveDailyNoteInput } from "~/storage/types";
import Home from "./index";

type Deferred<T = void> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
};

interface DelayedDraftLoad {
  readonly date: IsoDate;
  readonly result: LocalDraft | null;
  readonly started: Deferred<void>;
  readonly finish: Deferred<void>;
  consumed: boolean;
}

interface DelayedClearAll {
  readonly started: Deferred<void>;
  readonly finish: Deferred<void>;
}

interface DelayedRemoteSave {
  readonly date: IsoDate;
  readonly started: Deferred<void>;
  readonly finish: Deferred<void>;
  consumed: boolean;
}

const testState = vi.hoisted(() => ({
  drafts: new Map<string, LocalDraft>(),
  delayedDraftLoad: null as DelayedDraftLoad | null,
  delayedClearAll: null as DelayedClearAll | null,
  delayedRemoteSave: null as DelayedRemoteSave | null,
  remoteNote: null as null | {
    readonly date: string;
    readonly markdown: string;
    readonly revisionId: string;
    readonly updatedAt: string;
  },
  remoteLoadInputs: [] as IsoDate[],
  loadAuthError: false,
  saveConflict: false,
  wysiwygSelectionAvailable: true,
  inlineCodeToggleCount: 0,
  inlineMarkToggleInputs: [] as Array<"italic" | "bold">,
  blockQuoteToggleCount: 0,
  blockQuoteToggleSelections: [] as Array<{ readonly start: number; readonly end: number } | undefined>,
  taskListItemToggleCount: 0,
  taskListItemToggleSelections: [] as Array<{ readonly start: number; readonly end: number } | undefined>,
  focusSelectionApplyCount: 0
}));

vi.mock("~/config", () => ({
  APP_VERSION: "test",
  ENABLE_FAKE_AUTH: true,
  FORCE_FAKE_STORAGE: true,
  GOOGLE_CLIENT_ID: "",
  LOCAL_DRAFT_DEBOUNCE_MS: 250
}));

vi.mock("~/components/MilkdownEditor", async () => {
  const { createEffect } = await vi.importActual<typeof import("solid-js")>("solid-js");

  return {
  MilkdownEditor: (props: {
    readonly documentKey: string;
    readonly focusSelection?: { readonly start: number; readonly end: number } | null;
    readonly resetKey?: number;
    readonly value: string;
    readonly readOnly?: boolean;
    readonly onChange: (documentKey: string, markdown: string) => void;
    readonly onBlur: (documentKey: string, markdown: string) => void;
    readonly onController?: (controller: {
      readonly applyRawMarkdown: (markdown: string) => void;
      readonly applyStructuralTab: (shiftKey: boolean) => boolean;
      readonly closeHistory: () => void;
      readonly getHistoryAvailability: () => { readonly canUndo: boolean; readonly canRedo: boolean };
      readonly getInlineFormatState: () => { readonly italic: boolean; readonly bold: boolean; readonly code: boolean };
      readonly getBlockFormatState: () => { readonly quote: boolean };
      readonly getListItemFormatState: () => { readonly task: boolean };
      readonly getSelection: () => { readonly start: number; readonly end: number } | null;
      readonly redo: () => boolean;
      readonly toggleBlockQuoteAtSelection: (selection?: { readonly start: number; readonly end: number }) => boolean;
      readonly toggleInlineCodeAtSelection: () => boolean;
      readonly toggleInlineMarkAtSelection: (format: "italic" | "bold") => boolean;
      readonly toggleTaskListItemAtSelection: (selection?: { readonly start: number; readonly end: number }) => boolean;
      readonly undo: () => boolean;
    } | null) => void;
    readonly onHistoryAvailabilityChange?: (availability: { readonly canUndo: boolean; readonly canRedo: boolean }) => void;
    readonly onInlineFormatStateChange?: (state: { readonly italic: boolean; readonly bold: boolean; readonly code: boolean }) => void;
    readonly onBlockFormatStateChange?: (state: { readonly quote: boolean }) => void;
    readonly onListItemFormatStateChange?: (state: { readonly task: boolean }) => void;
  }) => {
    let textarea: HTMLTextAreaElement | undefined;
    let present = props.value;
    const past: string[] = [];
    const future: string[] = [];
    const inlineFormatState = {
      italic: false,
      bold: false,
      code: false
    };
    const blockFormatState = {
      quote: false
    };
    const listItemFormatState = {
      task: false
    };
    const historyAvailability = () => ({
      canUndo: past.length > 0,
      canRedo: future.length > 0
    });
    const reportInlineFormatState = () => props.onInlineFormatStateChange?.({ ...inlineFormatState });
    const reportBlockFormatState = () => props.onBlockFormatStateChange?.({ ...blockFormatState });
    const reportListItemFormatState = () => props.onListItemFormatStateChange?.({ ...listItemFormatState });
    const reportHistoryAvailability = () => props.onHistoryAvailabilityChange?.(historyAvailability());
    const controllerSerializedMarkdown = (markdown: string) => markdown.endsWith(" ") ? `${markdown.trimEnd()}\n` : markdown;

    const recordControllerMarkdown = (markdown: string) => {
      const serialized = controllerSerializedMarkdown(markdown);
      if (serialized === present) return;
      past.push(present);
      present = serialized;
      future.length = 0;
      if (textarea !== undefined) textarea.value = serialized;
      reportHistoryAvailability();
    };
    const recordUserEdit = (markdown: string) => {
      recordControllerMarkdown(markdown);
      props.onChange(props.documentKey, markdown);
    };
    const undo = () => {
      const previous = past.pop();
      if (previous === undefined) return false;
      future.push(present);
      present = previous;
      if (textarea !== undefined) textarea.value = previous;
      props.onChange(props.documentKey, previous);
      reportHistoryAvailability();
      return true;
    };
    const redo = () => {
      const next = future.pop();
      if (next === undefined) return false;
      past.push(present);
      present = next;
      if (textarea !== undefined) textarea.value = next;
      props.onChange(props.documentKey, next);
      reportHistoryAvailability();
      return true;
    };
    const applyStructuralTab = (shiftKey: boolean) => {
      if (textarea === undefined) return false;
      const current = textarea.value;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const lineStart = current.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
      const replace = (start: number, end: number, replacement: string) => {
        const next = `${current.slice(0, start)}${replacement}${current.slice(end)}`;
        const delta = replacement.length - (end - start);
        const mapOffset = (offset: number) => {
          if (offset <= start) return offset;
          if (offset >= end) return offset + delta;
          return start + replacement.length;
        };
        textarea!.value = next;
        textarea!.setSelectionRange(mapOffset(selectionStart), mapOffset(selectionEnd));
        recordUserEdit(next);
      };

      if (shiftKey) {
        if (current.startsWith("* ", lineStart)) {
          replace(lineStart, lineStart + 2, "");
          return true;
        }
        if (current.startsWith("  ", lineStart)) {
          replace(lineStart, lineStart + 2, "");
          return true;
        }
        return true;
      }

      replace(lineStart, lineStart, current.startsWith("* ", lineStart) ? "  " : "* ");
      return true;
    };

    props.onController?.({
      applyRawMarkdown: recordControllerMarkdown,
      applyStructuralTab,
      closeHistory: () => undefined,
      getBlockFormatState: () => ({ ...blockFormatState }),
      getHistoryAvailability: historyAvailability,
      getInlineFormatState: () => ({ ...inlineFormatState }),
      getListItemFormatState: () => ({ ...listItemFormatState }),
      getSelection: () =>
        textarea === undefined || !testState.wysiwygSelectionAvailable
          ? null
          : {
              start: textarea.selectionStart,
              end: textarea.selectionEnd
            },
      redo,
      toggleBlockQuoteAtSelection: (selection) => {
        testState.blockQuoteToggleCount += 1;
        testState.blockQuoteToggleSelections.push(selection);
        blockFormatState.quote = !blockFormatState.quote;
        reportBlockFormatState();
        textarea?.focus();
        return true;
      },
      toggleInlineCodeAtSelection: () => {
        testState.inlineCodeToggleCount += 1;
        if (textarea !== undefined && textarea.selectionStart !== textarea.selectionEnd) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const next = `${textarea.value.slice(0, start)}\`${textarea.value.slice(start, end)}\`${textarea.value.slice(end)}`;
          recordUserEdit(next);
          textarea.setSelectionRange(start + 1, end + 1);
          reportInlineFormatState();
          textarea.focus();
          return true;
        }

        inlineFormatState.code = !inlineFormatState.code;
        reportInlineFormatState();
        textarea?.focus();
        return true;
      },
      toggleInlineMarkAtSelection: (format) => {
        testState.inlineMarkToggleInputs.push(format);
        inlineFormatState[format] = !inlineFormatState[format];
        reportInlineFormatState();
        textarea?.focus();
        return true;
      },
      toggleTaskListItemAtSelection: (selection) => {
        testState.taskListItemToggleCount += 1;
        testState.taskListItemToggleSelections.push(selection);
        listItemFormatState.task = !listItemFormatState.task;
        reportListItemFormatState();
        textarea?.focus();
        return true;
      },
      undo
    });
    reportHistoryAvailability();
    reportInlineFormatState();
    reportBlockFormatState();
    reportListItemFormatState();

    createEffect(() => {
      const value = props.value;
      if (value !== present && controllerSerializedMarkdown(value) !== present) {
        past.length = 0;
        future.length = 0;
        present = value;
        if (textarea !== undefined && textarea.value !== value) textarea.value = value;
        reportHistoryAvailability();
      }
    });

    createEffect(() => {
      props.resetKey;
      const selection = props.focusSelection;
      if (textarea === undefined || selection === null || selection === undefined) return;
      queueMicrotask(() => {
        testState.focusSelectionApplyCount += 1;
        textarea?.setSelectionRange(selection.start, selection.end);
      });
    });

    return (
      <textarea
        aria-label="Mock WYSIWYG editor"
        ref={(element) => {
          textarea = element;
        }}
        readOnly={props.readOnly === true}
        value={props.value}
        onInput={(event) => recordUserEdit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
            if (undo()) event.preventDefault();
          } else if (
            (event.key.toLowerCase() === "y" && event.ctrlKey) ||
            (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && event.shiftKey)
          ) {
            if (redo()) event.preventDefault();
          }
        }}
        onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
      />
    );
  }
  };
});

vi.mock("~/storage/localDraftStore", () => ({
  IndexedDbLocalDraftStore: class {
    async load(date: IsoDate) {
      const delayedLoad = testState.delayedDraftLoad;
      if (delayedLoad !== null && !delayedLoad.consumed && delayedLoad.date === date) {
        delayedLoad.consumed = true;
        delayedLoad.started.resolve();
        await delayedLoad.finish.promise;
        return delayedLoad.result;
      }

      return testState.drafts.get(date) ?? null;
    }

    async listExistingDailyNoteDates() {
      return Array.from(testState.drafts.keys()).sort();
    }

    async listDirty() {
      return Array.from(testState.drafts.values()).filter((draft) => draft.dirty);
    }

    async save(draft: LocalDraft) {
      testState.drafts.set(draft.date, draft);
    }

    async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft) {
      const current = testState.drafts.get(date) ?? null;
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      testState.drafts.set(date, draft);
      return true;
    }

    async remove(date: IsoDate) {
      testState.drafts.delete(date);
    }

    async clearAll() {
      testState.drafts.clear();
      const delayedClearAll = testState.delayedClearAll;
      if (delayedClearAll !== null) {
        delayedClearAll.started.resolve();
        await delayedClearAll.finish.promise;
      }
    }
  },
  createDraft: (date: string, markdown: string, baselineMarkdown: string, baselineRevisionId: string | null, dirty: boolean) => ({
    date,
    markdown,
    baselineMarkdown,
    baselineRevisionId,
    dirty,
    updatedAt: "2030-01-01T00:00:00.000Z"
  })
}));

vi.mock("~/storage/fakeRemoteStorage", async () => {
  const { DEFAULT_JOT_SETTINGS } = await vi.importActual<typeof import("~/domain/settings")>("~/domain/settings");
  const { GoogleAccessTokenUnavailableError } = await vi.importActual<typeof import("~/auth/googleIdentity")>("~/auth/googleIdentity");

  class FakeRemoteStorageProvider {
    async loadDailyNote(date: IsoDate) {
      testState.remoteLoadInputs.push(date);
      if (testState.loadAuthError) throw new GoogleAccessTokenUnavailableError();
      return testState.remoteNote?.date === date ? testState.remoteNote : null;
    }

    async listDailyNoteDates() {
      return testState.remoteNote === null ? [] : [testState.remoteNote.date];
    }

    async saveDailyNote(input: SaveDailyNoteInput) {
      const delayedSave = testState.delayedRemoteSave;
      if (delayedSave !== null && !delayedSave.consumed && delayedSave.date === input.date) {
        delayedSave.consumed = true;
        delayedSave.started.resolve();
        await delayedSave.finish.promise;
      }

      if (testState.saveConflict) {
        return {
          type: "conflict" as const,
          remote: {
            date: input.date,
            markdown: "before\nremote\nsame\nafter\n",
            revisionId: "remote-revision",
            updatedAt: "2030-01-01T00:00:00.000Z"
          }
        };
      }

      testState.remoteNote = {
        date: input.date,
        markdown: input.markdown,
        revisionId: "saved-revision",
        updatedAt: "2030-01-01T00:00:00.000Z"
      };
      return {
        type: "saved" as const,
        note: testState.remoteNote
      };
    }

    async loadSettings() {
      return null;
    }

    async saveSettings(settings: unknown) {
      return settings;
    }

    async loadJotImageAlbum() {
      return null;
    }

    async saveJotImageAlbum() {
      return undefined;
    }

    async loadImageAttachmentMetadata() {
      return null;
    }

    async findImageAttachmentMetadataByCopiedMediaItemId() {
      return null;
    }

    async findImageAttachmentMetadataByMediaItemId() {
      return null;
    }

    async saveImageAttachmentMetadata() {
      return undefined;
    }
  }

  return {
    FakeRemoteStorageProvider,
    loadSettingsOrDefault: async () => DEFAULT_JOT_SETTINGS
  };
});

describe("Home reconnect and conflict handling", () => {
  beforeEach(() => {
    testState.drafts.clear();
    testState.delayedDraftLoad = null;
    testState.delayedClearAll = null;
    testState.delayedRemoteSave = null;
    testState.remoteNote = null;
    testState.remoteLoadInputs = [];
    testState.loadAuthError = false;
    testState.saveConflict = false;
    testState.wysiwygSelectionAvailable = true;
    testState.inlineCodeToggleCount = 0;
    testState.inlineMarkToggleInputs = [];
    testState.blockQuoteToggleCount = 0;
    testState.blockQuoteToggleSelections = [];
    testState.taskListItemToggleCount = 0;
    testState.taskListItemToggleSelections = [];
    testState.focusSelectionApplyCount = 0;
    window.location.hash = "#/date/2030-02-02";
    localStorage.setItem("jot.fakeAuth", "true");
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    window.location.hash = "";
  });

  it("shows the reconnect modal once and leaves the heading reconnect button after dismissal", async () => {
    testState.loadAuthError = true;
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    expect(host.textContent).toContain("Reconnect to sync");
    clickButton(host, "Not now");
    await settle();

    expect(dialog(host, "Reconnect to sync")).toBeNull();
    expect(button(host, "Reconnect")).not.toBeNull();

    await settle();
    expect(dialog(host, "Reconnect to sync")).toBeNull();

    dispose();
  });

  it("cancels pending selected-date loads before clearing drafts on sign-out", async () => {
    const cachedDraft = draft("2030-02-02", "cached before sign-out");
    testState.drafts.set("2030-02-02", cachedDraft);
    testState.delayedDraftLoad = delayedDraftLoad("2030-02-02", cachedDraft);
    testState.delayedClearAll = delayedClearAll();
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "remote after sign-out",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await testState.delayedDraftLoad.started.promise;

    host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
    await settle();
    clickButton(host, "Sign out");
    await testState.delayedClearAll.started.promise;

    testState.delayedDraftLoad.finish.resolve();
    await settle();

    expect(testState.remoteLoadInputs).toEqual([]);
    expect(testState.drafts.size).toBe(0);

    testState.delayedClearAll.finish.resolve();
    await settle();

    expect(testState.drafts.size).toBe(0);
    expect(localStorage.getItem("jot.fakeAuth")).toBeNull();

    dispose();
  });

  it("inserts manual conflict markers in raw mode and keeps WYSIWYG disabled while markers remain", async () => {
    testState.saveConflict = true;
    testState.drafts.set("2030-02-02", {
      date: "2030-02-02",
      markdown: "before\nlocal\nsame\nafter\n",
      baselineMarkdown: "before\nold\nsame\nafter\n",
      baselineRevisionId: "baseline-revision",
      dirty: true,
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    clickButton(host, "Saved locally");
    await settle();
    expect(dialog(host, "Sync conflict")).not.toBeNull();

    clickButton(host, "Resolve manually");
    await settle();

    const rawToggle = rawModeButton(host);
    expect(rawToggle.getAttribute("aria-pressed")).toBe("true");
    expect(rawToggle.disabled).toBe(true);
    expect(host.querySelector<HTMLTextAreaElement>(".plain-text-editor")?.value).toContain("<<<<<<< Local Draft");

    dispose();
  });

  it("toggles the link at the editor cursor from the heading button", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Read <https://example.com/docs/sync-model> today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("Read <https://example".length, "Read <https://example".length);
    editor!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle link format']");
    expect(toggle).not.toBeNull();
    expect(toggle!.title).toBe("Toggle link format");
    toggle!.click();
    await settle();

    expect(editor!.value).toBe("Read [sync-model](<https://example.com/docs/sync-model>) today");

    dispose();
  });

  it("toggles code formatting at the WYSIWYG editor selection from the heading button", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Use foo today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("Use ".length, "Use foo".length);
    editor!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']");
    expect(toggle).not.toBeNull();
    expect(toggle!.title).toBe("Toggle code format");
    toggle!.click();
    await settle();

    expect(editor!.value).toBe("Use `foo` today");

    dispose();
  });

  it("keeps WYSIWYG code formatting undoable and restores the formatted selection", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Use foo today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("Use ".length, "Use foo".length);

    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']")!.click();
    await settle();

    expect(editor!.value).toBe("Use `foo` today");
    expect(editor!.selectionStart).toBe("Use `".length);
    expect(editor!.selectionEnd).toBe("Use `foo".length);

    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    expect(undo).not.toBeNull();
    expect(undo!.disabled).toBe(false);
    undo!.click();
    await settle();

    expect(editor!.value).toBe("Use foo today");

    dispose();
  });

  it("toggles the WYSIWYG inline-code mark instead of inserting backticks at a collapsed cursor", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Use  today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("Use ".length, "Use ".length);

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']");
    expect(toggle).not.toBeNull();
    toggle!.click();
    await settle();

    expect(testState.inlineCodeToggleCount).toBe(1);
    expect(testState.focusSelectionApplyCount).toBe(0);
    expect(editor!.value).toBe("Use  today");
    expect(editor!.selectionStart).toBe("Use ".length);
    expect(editor!.selectionEnd).toBe("Use ".length);

    toggle!.click();
    await settle();

    expect(testState.inlineCodeToggleCount).toBe(2);
    expect(testState.focusSelectionApplyCount).toBe(0);
    expect(editor!.value).toBe("Use  today");
    expect(editor!.selectionStart).toBe("Use ".length);
    expect(editor!.selectionEnd).toBe("Use ".length);

    dispose();
  });

  it("uses the WYSIWYG mark command for multi-line bold selections", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "first\n\nsecond",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange(0, "first\n\nsecond".length);

    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle bold format']")!.click();
    await settle();

    expect(testState.inlineMarkToggleInputs).toEqual(["bold"]);
    expect(editor!.value).toBe("first\n\nsecond");

    dispose();
  });

  it("toggles block quote formatting at the WYSIWYG editor selection from the heading button", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "quote me",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange(0, "quote me".length);

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle block quote format']");
    expect(toggle).not.toBeNull();
    expect(toggle!.title).toBe("Toggle block quote format");
    expect(toggle!.textContent).toBe('"');
    toggle!.click();
    await settle();

    expect(testState.blockQuoteToggleCount).toBe(1);
    expect(testState.blockQuoteToggleSelections).toEqual([{ start: 0, end: "quote me".length }]);
    expect(toggle!.getAttribute("aria-pressed")).toBe("true");

    dispose();
  });

  it("passes the selected WYSIWYG list item source range to the block quote controller", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "* abc\n\n123",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("* ".length, "* abc".length);

    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle block quote format']")!.click();
    await settle();

    expect(testState.blockQuoteToggleSelections).toEqual([{ start: "* ".length, end: "* abc".length }]);

    dispose();
  });

  it("uses the WYSIWYG selection captured before the quote button takes focus", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "* abc\n\n123",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    const quoteButton = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle block quote format']");
    expect(editor).not.toBeNull();
    expect(quoteButton).not.toBeNull();

    editor!.setSelectionRange("* ".length, "* abc".length);
    expect(quoteButton!.dispatchEvent(pointerDownEvent())).toBe(false);
    editor!.setSelectionRange("* abc\n\n".length, "* abc\n\n123".length);
    quoteButton!.click();
    await settle();

    expect(testState.blockQuoteToggleSelections).toEqual([{ start: "* ".length, end: "* abc".length }]);

    dispose();
  });

  it("passes the captured WYSIWYG selection to the task checkbox controller", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "* abc",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    const checkboxButton = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle task checkbox']");
    expect(editor).not.toBeNull();
    expect(checkboxButton).not.toBeNull();

    editor!.setSelectionRange("* ".length, "* abc".length);
    expect(checkboxButton!.dispatchEvent(pointerDownEvent())).toBe(false);
    editor!.setSelectionRange(0, 0);
    checkboxButton!.click();
    await settle();

    expect(testState.taskListItemToggleCount).toBe(1);
    expect(testState.taskListItemToggleSelections).toEqual([{ start: "* ".length, end: "* abc".length }]);
    expect(checkboxButton!.getAttribute("aria-pressed")).toBe("true");

    dispose();
  });

  it("prevents pointer focus transfer from formatting toolbar buttons", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "format me",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange(0, "format".length);

    for (const label of [
      "Toggle italic format",
      "Toggle bold format",
      "Toggle block quote format",
      "Toggle task checkbox",
      "Toggle code format",
      "Toggle link format"
    ]) {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
      expect(button).not.toBeNull();
      const event = pointerDownEvent();
      expect(button!.dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
    }

    await settle();
    expect(testState.focusSelectionApplyCount).toBeGreaterThan(0);

    dispose();
  });

  it("does not insert code markers at the start of the note when WYSIWYG selection is unavailable", async () => {
    testState.wysiwygSelectionAvailable = false;
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Use  today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();

    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']")!.click();
    await settle();

    expect(testState.inlineCodeToggleCount).toBe(0);
    expect(editor!.value).toBe("Use  today");

    dispose();
  });

  it("toggles code formatting at the raw editor selection from the heading button", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "first\nsecond",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange(0, "first\nsecond".length);

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']");
    expect(toggle).not.toBeNull();
    toggle!.click();
    await settle();

    expect(editor!.value).toBe("```\nfirst\nsecond\n```");

    dispose();
  });

  it("toggles block quote formatting at the raw editor selection from the heading button", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "first\nsecond",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange(0, "first\nsecond".length);

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle block quote format']");
    expect(toggle).not.toBeNull();
    toggle!.click();
    await settle();

    expect(editor!.value).toBe("> first\n> second");
    expect(editor!.selectionStart).toBe(2);
    expect(editor!.selectionEnd).toBe("> first\n> second".length);
    expect(toggle!.getAttribute("aria-pressed")).toBe("true");

    toggle!.click();
    await settle();

    expect(editor!.value).toBe("first\nsecond");
    expect(editor!.selectionStart).toBe(0);
    expect(editor!.selectionEnd).toBe("first\nsecond".length);
    expect(toggle!.getAttribute("aria-pressed")).toBe("false");

    dispose();
  });

  it("toggles a nested raw bullet into a task checkbox item", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "* parent\n  * child\n* after",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle task checkbox']");
    expect(editor).not.toBeNull();
    expect(toggle).not.toBeNull();
    editor!.setSelectionRange("* parent\n  * chi".length, "* parent\n  * chi".length);

    toggle!.click();
    await settle();

    expect(editor!.value).toBe("* parent\n  * [ ] child\n* after");
    expect(editor!.selectionStart).toBe("* parent\n  * [ ] chi".length);
    expect(editor!.selectionEnd).toBe("* parent\n  * [ ] chi".length);
    expect(toggle!.getAttribute("aria-pressed")).toBe("true");

    dispose();
  });

  it("inserts code markers at the raw editor cursor without dropping existing text", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.value = "abc ";
    editor!.setSelectionRange("abc ".length, "abc ".length);
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    editor!.setSelectionRange("abc ".length, "abc ".length);
    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']")!.click();
    await settle();

    expect(editor!.value).toBe("abc ``");
    expect(editor!.selectionStart).toBe("abc `".length);
    expect(editor!.selectionEnd).toBe("abc `".length);

    dispose();
  });

  it("marks raw inline format buttons active at the current cursor position", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Use *emphasis*, **strong**, and `code` today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const italic = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle italic format']");
    const bold = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle bold format']");
    const code = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']");
    expect(editor).not.toBeNull();
    expect(italic).not.toBeNull();
    expect(bold).not.toBeNull();
    expect(code).not.toBeNull();

    editor!.setSelectionRange("Use *e".length, "Use *e".length);
    editor!.dispatchEvent(new Event("select", { bubbles: true }));
    await waitFor(() => {
      expect(italic!.getAttribute("aria-pressed")).toBe("true");
      expect(bold!.getAttribute("aria-pressed")).toBe("false");
      expect(code!.getAttribute("aria-pressed")).toBe("false");
    });

    editor!.setSelectionRange("Use *emphasis*, **s".length, "Use *emphasis*, **s".length);
    editor!.dispatchEvent(new Event("select", { bubbles: true }));
    await waitFor(() => {
      expect(italic!.getAttribute("aria-pressed")).toBe("false");
      expect(bold!.getAttribute("aria-pressed")).toBe("true");
      expect(code!.getAttribute("aria-pressed")).toBe("false");
    });

    editor!.setSelectionRange("Use *emphasis*, **strong**, and `c".length, "Use *emphasis*, **strong**, and `c".length);
    editor!.dispatchEvent(new Event("select", { bubbles: true }));
    await waitFor(() => {
      expect(italic!.getAttribute("aria-pressed")).toBe("false");
      expect(bold!.getAttribute("aria-pressed")).toBe("false");
      expect(code!.getAttribute("aria-pressed")).toBe("true");
    });

    dispose();
  });

  it("marks the raw block quote button active at the current cursor position", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "plain\n> quoted",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const quote = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle block quote format']");
    expect(editor).not.toBeNull();
    expect(quote).not.toBeNull();

    editor!.setSelectionRange("plain".length, "plain".length);
    editor!.dispatchEvent(new Event("select", { bubbles: true }));
    await waitFor(() => {
      expect(quote!.getAttribute("aria-pressed")).toBe("false");
    });

    editor!.setSelectionRange("plain\n> quo".length, "plain\n> quo".length);
    editor!.dispatchEvent(new Event("select", { bubbles: true }));
    await waitFor(() => {
      expect(quote!.getAttribute("aria-pressed")).toBe("true");
    });

    dispose();
  });

  it("undoes and redoes raw cursor code insertion without normalizing trailing spaces", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.value = "abc ";
    editor!.setSelectionRange("abc ".length, "abc ".length);
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    editor!.setSelectionRange("abc ".length, "abc ".length);
    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle code format']")!.click();
    await settle();
    expect(editor!.value).toBe("abc ``");

    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(undo).not.toBeNull();
    expect(redo).not.toBeNull();

    undo!.click();
    await settle();

    expect(editor!.value).toBe("abc ");
    expect(undo!.disabled).toBe(false);
    expect(redo!.disabled).toBe(false);

    redo!.click();
    await settle();

    expect(editor!.value).toBe("abc ``");
    expect(redo!.disabled).toBe(true);

    dispose();
  });

  it("applies structural indent and dedent at the WYSIWYG editor selection from heading buttons", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "before",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("before".length, "before".length);

    const indent = host.querySelector<HTMLButtonElement>("button[aria-label='Indent']");
    expect(indent).not.toBeNull();
    expect(indent!.title).toBe("Indent (Tab)");
    indent!.click();
    await settle();

    expect(editor!.value).toBe("* before");

    editor!.setSelectionRange("* before".length, "* before".length);
    const dedent = host.querySelector<HTMLButtonElement>("button[aria-label='Dedent']");
    expect(dedent).not.toBeNull();
    expect(dedent!.title).toBe("Dedent (Shift+Tab)");
    dedent!.click();
    await settle();

    expect(editor!.value).toBe("before");

    dispose();
  });

  it("applies structural indent and dedent at the raw editor selection from heading buttons", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "before",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("before".length, "before".length);

    host.querySelector<HTMLButtonElement>("button[aria-label='Indent']")!.click();
    await settle();

    expect(editor!.value).toBe("* before");

    editor!.setSelectionRange("* before".length, "* before".length);
    host.querySelector<HTMLButtonElement>("button[aria-label='Dedent']")!.click();
    await settle();

    expect(editor!.value).toBe("before");

    editor!.value = "* [ ] Item";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    editor!.setSelectionRange("* [ ] Item".length, "* [ ] Item".length);
    host.querySelector<HTMLButtonElement>("button[aria-label='Dedent']")!.click();
    await settle();

    expect(editor!.value).toBe("Item");
    expect(editor!.selectionStart).toBe("Item".length);
    expect(editor!.selectionEnd).toBe("Item".length);

    dispose();
  });

  it("orders toolbar buttons and places raw mode after the today button", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const controls = Array.from(
      host.querySelectorAll(".toolbar-editor-column button.icon-button")
    ).map((element) => element.getAttribute("aria-label"));

    expect(controls).toEqual([
      "Undo",
      "Redo",
      "Indent",
      "Toggle task checkbox",
      "Dedent",
      "Toggle italic format",
      "Toggle bold format",
      "Toggle block quote format",
      "Toggle code format",
      "Toggle link format",
      "Insert image"
    ]);
    const dateContextLabels = Array.from(host.querySelectorAll(".date-context-row button")).map((element) =>
      element.getAttribute("aria-label")
    );
    expect(dateContextLabels).toEqual([
      `Jump to today, ${todayIsoDate()}`,
      "Toggle raw Markdown"
    ]);
    expect(host.querySelector<HTMLButtonElement>(`button[aria-label='Jump to today, ${todayIsoDate()}']`)!.disabled).toBe(false);
    expect(rawModeButton(host).title).toBe("Toggle raw Markdown (Ctrl/Cmd+Shift+M)");
    expect(
      host.querySelector("button[aria-label='Toggle block quote format'] .format-letter-quote")
    ).not.toBeNull();

    dispose();
  });

  it("disables the today button at today's date", async () => {
    const today = todayIsoDate();
    testState.remoteNote = {
      date: today,
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    window.location.hash = `#/date/${today}`;
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const todayButton = host.querySelector<HTMLButtonElement>("button[aria-label='Selected date is today']");
    expect(todayButton).not.toBeNull();
    expect(todayButton!.disabled).toBe(true);

    dispose();
  });

  it("renders sync status as an accessible colored circle", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const sync = host.querySelector<HTMLButtonElement>(".sync-status");
    expect(sync).not.toBeNull();
    expect(sync!.textContent).toBe("");
    expect(sync!.getAttribute("aria-label")).toContain("Synced");
    expect(sync!.classList.contains("sync-status-remote")).toBe(true);

    dispose();
  });

  it("places About first in the application menu", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
    await settle();

    expect(Array.from(host.querySelectorAll(".top-menu-popover [role='menuitem']")).map((element) => element.textContent)).toEqual([
      "About Jot",
      "Upload daily notes",
      "Settings",
      "Sign out"
    ]);

    dispose();
  });

  it("does not apply a stale local image preparation error after date navigation", async () => {
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "B original"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    await waitFor(() => {
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("A original");
    });

    host.querySelector<HTMLButtonElement>("button[aria-label='Insert image']")!.click();
    await settle();
    clickButton(host, "Upload from device");

    const upload = host.querySelector<HTMLInputElement>("input.hidden-file-input");
    expect(upload).not.toBeNull();
    Object.defineProperty(upload!, "files", {
      value: [new File(["not an image"], "not-image.txt", { type: "text/plain" })],
      configurable: true
    });
    upload!.dispatchEvent(new Event("change", { bubbles: true }));

    host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
    await waitFor(() => {
      expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("B original");
    });
    await settle();

    expect(host.textContent).not.toContain("Jot can only attach image files.");

    dispose();
  });

  it("does not apply a stale camera startup error after date navigation", async () => {
    const cameraStarted = deferred<void>();
    const cameraCanFail = deferred<void>();
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async () => {
          cameraStarted.resolve();
          await cameraCanFail.promise;
          throw new Error("Camera failed after navigation.");
        })
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "B original"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("A original");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert image']")!.click();
      await settle();
      clickButton(host, "Use camera");
      await cameraStarted.promise;

      host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
      await waitFor(() => {
        expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("B original");
      });

      cameraCanFail.resolve();
      await settle();

      expect(host.textContent).not.toContain("Camera failed after navigation.");
    } finally {
      dispose();
      Object.defineProperty(navigator, "mediaDevices", {
        value: originalMediaDevices,
        configurable: true
      });
    }
  });

  it("does not apply a stale camera preview error after date navigation", async () => {
    const cameraStarted = deferred<void>();
    const previewPlayStarted = deferred<void>();
    const previewPlayCanFail = deferred<void>();
    const originalMediaDevices = navigator.mediaDevices;
    const originalPlay = HTMLMediaElement.prototype.play;
    const stream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async () => {
          cameraStarted.resolve();
          return stream;
        })
      },
      configurable: true
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      value: vi.fn(async () => {
        previewPlayStarted.resolve();
        await previewPlayCanFail.promise;
        throw new Error("Camera preview failed after navigation.");
      }),
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "B original"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("A original");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert image']")!.click();
      await settle();
      clickButton(host, "Use camera");
      await cameraStarted.promise;
      await previewPlayStarted.promise;

      host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
      await waitFor(() => {
        expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("B original");
      });

      previewPlayCanFail.resolve();
      await settle();

      expect(host.textContent).not.toContain("Camera preview failed after navigation.");
    } finally {
      dispose();
      Object.defineProperty(navigator, "mediaDevices", {
        value: originalMediaDevices,
        configurable: true
      });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        value: originalPlay,
        configurable: true
      });
    }
  });

  it("does not let background dirty-draft sync repopulate drafts after sign-out", async () => {
    testState.drafts.set("2030-02-03", {
      date: "2030-02-03",
      markdown: "background dirty draft",
      baselineMarkdown: "",
      baselineRevisionId: null,
      dirty: true,
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    testState.delayedRemoteSave = delayedRemoteSave("2030-02-03");
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await testState.delayedRemoteSave.started.promise;

    host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
    await settle();
    clickButton(host, "Sign out");
    await settle();

    expect(testState.drafts.size).toBe(0);

    testState.delayedRemoteSave.finish.resolve();
    await settle();

    expect(testState.drafts.size).toBe(0);

    dispose();
  });

  it("does not let daily note upload repopulate drafts after sign-out", async () => {
    testState.delayedRemoteSave = delayedRemoteSave("2030-02-04");
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
    await settle();
    clickButton(host, "Upload daily notes");

    const upload = host.querySelector<HTMLInputElement>("input[accept='.md,text/markdown']");
    expect(upload).not.toBeNull();
    Object.defineProperty(upload!, "files", {
      value: [{
        name: "2030-02-04.md",
        text: async () => "uploaded note"
      }],
      configurable: true
    });
    upload!.dispatchEvent(new Event("change", { bubbles: true }));

    await testState.delayedRemoteSave.started.promise;
    expect(testState.drafts.get("2030-02-04")?.dirty).toBe(true);

    host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
    await settle();
    clickButton(host, "Sign out");
    await settle();

    expect(testState.drafts.size).toBe(0);

    testState.delayedRemoteSave.finish.resolve();
    await settle();

    expect(testState.drafts.size).toBe(0);
    expect(host.textContent).not.toContain("Uploaded 1 daily note.");

    dispose();
  });

  it("disables undo and redo buttons when their history stacks are empty", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(editor).not.toBeNull();
    expect(undo).not.toBeNull();
    expect(redo).not.toBeNull();

    expect(undo!.disabled).toBe(true);
    expect(redo!.disabled).toBe(true);

    editor!.value = "A";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(undo!.disabled).toBe(false);
    expect(redo!.disabled).toBe(true);

    undo!.click();
    await settle();

    expect(undo!.disabled).toBe(true);
    expect(redo!.disabled).toBe(false);

    redo!.click();
    await settle();

    expect(undo!.disabled).toBe(false);
    expect(redo!.disabled).toBe(true);

    dispose();
  });

  it("keeps redo disabled while raw typing clears the redo stack", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(editor).not.toBeNull();
    expect(undo).not.toBeNull();
    expect(redo).not.toBeNull();

    expect(undo!.disabled).toBe(true);
    expect(redo!.disabled).toBe(true);

    editor!.value = "A";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(undo!.disabled).toBe(false);
    expect(redo!.disabled).toBe(true);

    undo!.click();
    await settle();

    expect(undo!.disabled).toBe(true);
    expect(redo!.disabled).toBe(false);

    editor!.value = "B";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(undo!.disabled).toBe(false);
    expect(redo!.disabled).toBe(true);

    dispose();
  });

  it("does not apply raw undo history from one date to another", async () => {
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "B original"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    let editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    let undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    expect(editor).not.toBeNull();
    expect(undo).not.toBeNull();
    await waitFor(() => expect(editor!.value).toBe("A original"));

    editor!.value = "A edited";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(undo!.disabled).toBe(false);

    host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
    await waitFor(() => {
      expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!.value).toBe("B original");
    });

    editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    expect(editor).not.toBeNull();
    expect(undo).not.toBeNull();
    expect(undo!.disabled).toBe(true);

    expect(pressUndo(editor!)).toBe(false);
    await settle();

    expect(editor!.value).toBe("B original");
    expect(undo!.disabled).toBe(true);

    dispose();
  });

  it("ignores hidden WYSIWYG redo history when raw history is empty", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const wysiwygEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    const rawToggle = rawModeButton(host);
    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(wysiwygEditor).not.toBeNull();
    expect(undo).not.toBeNull();
    expect(redo).not.toBeNull();

    wysiwygEditor!.value = "A";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    undo!.click();
    await settle();

    expect(redo!.disabled).toBe(false);

    rawToggle.click();
    await settle();

    expect(undo!.disabled).toBe(true);
    expect(redo!.disabled).toBe(true);

    dispose();
  });

  it("does not delegate raw keyboard undo to hidden WYSIWYG history", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const wysiwygEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(wysiwygEditor).not.toBeNull();
    wysiwygEditor!.value = "A";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    rawModeButton(host).click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    expect(rawEditor).not.toBeNull();
    expect(undo).not.toBeNull();
    expect(rawEditor!.value).toBe("A");
    expect(undo!.disabled).toBe(true);

    expect(pressUndo(rawEditor!)).toBe(false);
    await settle();

    expect(rawEditor!.value).toBe("A");

    dispose();
  });

  it("does not delegate raw keyboard redo to hidden WYSIWYG history", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const wysiwygEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(wysiwygEditor).not.toBeNull();
    wysiwygEditor!.value = "A";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    host.querySelector<HTMLButtonElement>("button[aria-label='Undo']")!.click();
    await settle();

    expect(wysiwygEditor!.value).toBe("");

    rawModeButton(host).click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(rawEditor).not.toBeNull();
    expect(redo).not.toBeNull();
    expect(rawEditor!.value).toBe("");
    expect(redo!.disabled).toBe(true);

    expect(pressRedo(rawEditor!)).toBe(false);
    await settle();

    expect(rawEditor!.value).toBe("");

    dispose();
  });

  it("undoes and redoes WYSIWYG edits from heading buttons", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.value = "A";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();
    editor!.value = "AB";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    expect(undo).not.toBeNull();
    expect(undo!.title).toBe("Undo (Ctrl/Cmd+Z)");
    undo!.click();
    await settle();

    expect(editor!.value).toBe("A");

    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(redo).not.toBeNull();
    expect(redo!.title).toBe("Redo (Ctrl/Cmd+Shift+Z)");
    redo!.click();
    await settle();

    expect(editor!.value).toBe("AB");

    dispose();
  });

  it("undoes and redoes raw edits from heading buttons", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.value = "A";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();
    editor!.value = "AB";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    host.querySelector<HTMLButtonElement>("button[aria-label='Undo']")!.click();
    await settle();

    expect(editor!.value).toBe("A");

    host.querySelector<HTMLButtonElement>("button[aria-label='Redo']")!.click();
    await settle();

    expect(editor!.value).toBe("AB");

    dispose();
  });

  it("keeps editor instances mounted across raw and WYSIWYG switches so undo history survives", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Keep undoable edits",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const wysiwygEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(wysiwygEditor).not.toBeNull();

    const rawToggle = rawModeButton(host);
    rawToggle.click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")).toBe(wysiwygEditor);

    rawToggle.click();
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")).toBe(rawEditor);
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")).toBe(wysiwygEditor);

    dispose();
  });

  it("captures the WYSIWYG selection before the raw toggle takes focus", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "abcdef",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const wysiwygEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(wysiwygEditor).not.toBeNull();
    wysiwygEditor!.value = "abXYZcdef";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();
    wysiwygEditor!.setSelectionRange(2, 5);

    const rawToggle = rawModeButton(host);
    rawToggle.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    wysiwygEditor!.setSelectionRange(0, 0);
    rawToggle.click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(rawEditor!.value).toBe("abXYZcdef");
    expect(rawEditor!.selectionStart).toBe(2);
    expect(rawEditor!.selectionEnd).toBe(5);

    dispose();
  });

  it("keeps raw-mode history out of WYSIWYG undo after returning to WYSIWYG", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const wysiwygEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(wysiwygEditor).not.toBeNull();
    wysiwygEditor!.value = "A";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    const rawToggle = rawModeButton(host);
    rawToggle.click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(rawEditor!.value).toBe("A");
    rawEditor!.value = "AB";
    rawEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    rawToggle.click();
    await settle();

    expect(wysiwygEditor!.value).toBe("AB");
    wysiwygEditor!.value = "ABC";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(pressUndo(wysiwygEditor!)).toBe(true);
    await settle();
    expect(wysiwygEditor!.value).toBe("AB");

    expect(pressUndo(wysiwygEditor!)).toBe(false);
    await settle();
    expect(wysiwygEditor!.value).toBe("AB");
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!.value).toBe("AB");

    dispose();
  });
});

function dialog(host: ParentNode, title: string): Element | null {
  return Array.from(host.querySelectorAll("[role='dialog']")).find((element) => element.textContent?.includes(title)) ?? null;
}

function button(host: ParentNode, label: string): HTMLButtonElement | null {
  return Array.from(host.querySelectorAll("button")).find((element) =>
    element.textContent === label || element.getAttribute("aria-label")?.includes(label)
  ) ?? null;
}

function clickButton(host: ParentNode, label: string): void {
  const element = button(host, label);
  expect(element).not.toBeNull();
  element!.click();
}

function rawModeButton(host: ParentNode): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle raw Markdown']");
  expect(element).not.toBeNull();
  return element!;
}

function pressUndo(editor: HTMLTextAreaElement): boolean {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "z",
    metaKey: true
  });
  editor.dispatchEvent(event);
  return event.defaultPrevented;
}

function pressRedo(editor: HTMLTextAreaElement): boolean {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "z",
    metaKey: true,
    shiftKey: true
  });
  editor.dispatchEvent(event);
  return event.defaultPrevented;
}

function pointerDownEvent(): PointerEvent {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

function draft(date: IsoDate, markdown: string): LocalDraft {
  return {
    date,
    markdown,
    baselineMarkdown: markdown,
    baselineRevisionId: null,
    dirty: false,
    updatedAt: "2030-01-01T00:00:00.000Z"
  };
}

function delayedDraftLoad(date: IsoDate, result: LocalDraft | null): DelayedDraftLoad {
  return {
    date,
    result,
    started: deferred<void>(),
    finish: deferred<void>(),
    consumed: false
  };
}

function delayedClearAll(): DelayedClearAll {
  return {
    started: deferred<void>(),
    finish: deferred<void>()
  };
}

function delayedRemoteSave(date: IsoDate): DelayedRemoteSave {
  return {
    date,
    started: deferred<void>(),
    finish: deferred<void>(),
    consumed: false
  };
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function waitFor(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await settle();
    }
  }
}
