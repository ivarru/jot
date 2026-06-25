import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, SaveDailyNoteInput } from "~/storage/types";

export type Deferred<T = void> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
};

export interface DelayedDraftLoad {
  readonly date: IsoDate;
  readonly result: LocalDraft | null;
  readonly started: Deferred<void>;
  readonly finish: Deferred<void>;
  consumed: boolean;
}

export interface DelayedClearAll {
  readonly started: Deferred<void>;
  readonly finish: Deferred<void>;
}

export interface DelayedRemoteSave {
  readonly date: IsoDate;
  readonly started: Deferred<void>;
  readonly finish: Deferred<void>;
  consumed: boolean;
}

const routeTestState = vi.hoisted(() => ({
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
  focusSelectionApplyCount: 0,
  setWysiwygInternalMarkdown: null as ((markdown: string) => void) | null,
  savedSettings: [] as unknown[]
}));

export function getRouteTestState(): typeof routeTestState {
  return routeTestState;
}

vi.mock("~/config", () => ({
  APP_COPYRIGHT: "Copyright (c) 2026 Test Author",
  APP_LICENSE: "MIT",
  APP_PROJECT_URL: "https://github.com/example/jot",
  APP_VERSION: "test",
  ENABLE_FAKE_AUTH: true,
  FORCE_FAKE_STORAGE: true,
  GOOGLE_CLIENT_ID: "",
  LOCAL_DRAFT_DEBOUNCE_MS: 250,
  MILKDOWN_VERSION: "7.21.1"
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
      readonly spellcheck?: boolean;
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
        readonly getMarkdown: () => string;
        readonly getLiveMarkdown: () => string;
        readonly getSelection: () => { readonly start: number; readonly end: number } | null;
        readonly focusCurrentSelection: () => void;
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
      const setInternalMarkdownWithoutChangeEvent = (markdown: string) => {
        present = markdown;
        if (textarea !== undefined) textarea.value = markdown;
      };

      routeTestState.setWysiwygInternalMarkdown = setInternalMarkdownWithoutChangeEvent;

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
        getMarkdown: () => present,
        getLiveMarkdown: () => textarea?.value ?? present,
        getSelection: () =>
          textarea === undefined || !routeTestState.wysiwygSelectionAvailable
            ? null
            : {
              start: textarea.selectionStart,
              end: textarea.selectionEnd
            },
        focusCurrentSelection: () => undefined,
        redo,
        toggleBlockQuoteAtSelection: (selection) => {
          routeTestState.blockQuoteToggleCount += 1;
          routeTestState.blockQuoteToggleSelections.push(selection);
          blockFormatState.quote = !blockFormatState.quote;
          reportBlockFormatState();
          textarea?.focus();
          return true;
        },
        toggleInlineCodeAtSelection: () => {
          routeTestState.inlineCodeToggleCount += 1;
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
          routeTestState.inlineMarkToggleInputs.push(format);
          inlineFormatState[format] = !inlineFormatState[format];
          reportInlineFormatState();
          textarea?.focus();
          return true;
        },
        toggleTaskListItemAtSelection: (selection) => {
          routeTestState.taskListItemToggleCount += 1;
          routeTestState.taskListItemToggleSelections.push(selection);
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
          routeTestState.focusSelectionApplyCount += 1;
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
          spellcheck={props.spellcheck !== false ? "true" : "false"}
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
      const delayedLoad = routeTestState.delayedDraftLoad;
      if (delayedLoad !== null && !delayedLoad.consumed && delayedLoad.date === date) {
        delayedLoad.consumed = true;
        delayedLoad.started.resolve();
        await delayedLoad.finish.promise;
        return delayedLoad.result;
      }

      return routeTestState.drafts.get(date) ?? null;
    }

    async listExistingDailyNoteDates() {
      return Array.from(routeTestState.drafts.keys()).sort();
    }

    async listDirty() {
      return Array.from(routeTestState.drafts.values()).filter((draft) => draft.dirty);
    }

    async save(draft: LocalDraft) {
      routeTestState.drafts.set(draft.date, draft);
    }

    async saveIfUnchanged(date: IsoDate, expected: LocalDraft | null, draft: LocalDraft) {
      const current = routeTestState.drafts.get(date) ?? null;
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      routeTestState.drafts.set(date, draft);
      return true;
    }

    async remove(date: IsoDate) {
      routeTestState.drafts.delete(date);
    }

    async clearAll() {
      routeTestState.drafts.clear();
      const delayedClearAll = routeTestState.delayedClearAll;
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
      routeTestState.remoteLoadInputs.push(date);
      if (routeTestState.loadAuthError) throw new GoogleAccessTokenUnavailableError();
      return routeTestState.remoteNote?.date === date ? routeTestState.remoteNote : null;
    }

    async listDailyNoteDates() {
      return routeTestState.remoteNote === null ? [] : [routeTestState.remoteNote.date];
    }

    async saveDailyNote(input: SaveDailyNoteInput) {
      const delayedSave = routeTestState.delayedRemoteSave;
      if (delayedSave !== null && !delayedSave.consumed && delayedSave.date === input.date) {
        delayedSave.consumed = true;
        delayedSave.started.resolve();
        await delayedSave.finish.promise;
      }

      if (routeTestState.saveConflict) {
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

      routeTestState.remoteNote = {
        date: input.date,
        markdown: input.markdown,
        revisionId: "saved-revision",
        updatedAt: "2030-01-01T00:00:00.000Z"
      };
      return {
        type: "saved" as const,
        note: routeTestState.remoteNote
      };
    }

    async loadSettings() {
      return null;
    }

    async saveSettings(settings: unknown) {
      routeTestState.savedSettings.push(settings);
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

export function resetRouteTestState(): void {
  routeTestState.drafts.clear();
  routeTestState.delayedDraftLoad = null;
  routeTestState.delayedClearAll = null;
  routeTestState.delayedRemoteSave = null;
  routeTestState.remoteNote = null;
  routeTestState.remoteLoadInputs = [];
  routeTestState.loadAuthError = false;
  routeTestState.saveConflict = false;
  routeTestState.wysiwygSelectionAvailable = true;
  routeTestState.inlineCodeToggleCount = 0;
  routeTestState.inlineMarkToggleInputs = [];
  routeTestState.blockQuoteToggleCount = 0;
  routeTestState.blockQuoteToggleSelections = [];
  routeTestState.taskListItemToggleCount = 0;
  routeTestState.taskListItemToggleSelections = [];
  routeTestState.focusSelectionApplyCount = 0;
  routeTestState.setWysiwygInternalMarkdown = null;
  routeTestState.savedSettings = [];
  window.location.hash = "#/date/2030-02-02";
  localStorage.setItem("jot.fakeAuth", "true");
}

export function cleanupRouteTestDom(): void {
  document.body.replaceChildren();
  localStorage.clear();
  window.location.hash = "";
}
