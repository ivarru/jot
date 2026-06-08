import { render } from "solid-js/web";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, SaveDailyNoteInput } from "~/storage/types";
import Home from "./index";

const testState = vi.hoisted(() => ({
  drafts: new Map<string, LocalDraft>(),
  remoteNote: null as null | {
    readonly date: string;
    readonly markdown: string;
    readonly revisionId: string;
    readonly updatedAt: string;
  },
  loadAuthError: false,
  saveConflict: false
}));

vi.mock("~/config", () => ({
  APP_VERSION: "test",
  ENABLE_FAKE_AUTH: true,
  FORCE_FAKE_STORAGE: true,
  GOOGLE_CLIENT_ID: "",
  LOCAL_DRAFT_DEBOUNCE_MS: 250
}));

vi.mock("~/components/MilkdownEditor", () => ({
  MilkdownEditor: (props: {
    readonly documentKey: string;
    readonly value: string;
    readonly readOnly?: boolean;
    readonly onChange: (documentKey: string, markdown: string) => void;
    readonly onBlur: (documentKey: string, markdown: string) => void;
    readonly onController?: (controller: {
      readonly applyRawMarkdown: (markdown: string) => void;
      readonly closeHistory: () => void;
      readonly getSelection: () => { readonly start: number; readonly end: number } | null;
      readonly redo: () => boolean;
      readonly undo: () => boolean;
    } | null) => void;
  }) => {
    let textarea: HTMLTextAreaElement | undefined;
    let present = props.value;
    const past: string[] = [];
    const future: string[] = [];

    const record = (markdown: string) => {
      if (markdown === present) return;
      past.push(present);
      present = markdown;
      future.length = 0;
      props.onChange(props.documentKey, markdown);
    };
    const undo = () => {
      const previous = past.pop();
      if (previous === undefined) return false;
      future.push(present);
      present = previous;
      props.onChange(props.documentKey, previous);
      return true;
    };
    const redo = () => {
      const next = future.pop();
      if (next === undefined) return false;
      past.push(present);
      present = next;
      props.onChange(props.documentKey, next);
      return true;
    };

    props.onController?.({
      applyRawMarkdown: record,
      closeHistory: () => undefined,
      getSelection: () =>
        textarea === undefined
          ? null
          : {
              start: textarea.selectionStart,
              end: textarea.selectionEnd
            },
      redo,
      undo
    });

    return (
      <textarea
        aria-label="Mock WYSIWYG editor"
        ref={(element) => {
          textarea = element;
        }}
        readOnly={props.readOnly === true}
        value={props.value}
        onInput={(event) => record(event.currentTarget.value)}
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
}));

vi.mock("~/storage/localDraftStore", () => ({
  IndexedDbLocalDraftStore: class {
    async load(date: IsoDate) {
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
      if (testState.loadAuthError) throw new GoogleAccessTokenUnavailableError();
      return testState.remoteNote?.date === date ? testState.remoteNote : null;
    }

    async listDailyNoteDates() {
      return testState.remoteNote === null ? [] : [testState.remoteNote.date];
    }

    async saveDailyNote(input: SaveDailyNoteInput) {
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
    testState.remoteNote = null;
    testState.loadAuthError = false;
    testState.saveConflict = false;
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

    const rawToggle = host.querySelector<HTMLInputElement>(".raw-mode-toggle input");
    expect(rawToggle).not.toBeNull();
    expect(rawToggle!.checked).toBe(true);
    expect(rawToggle!.disabled).toBe(true);
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

    const rawToggle = host.querySelector<HTMLInputElement>(".raw-mode-toggle input");
    expect(rawToggle).not.toBeNull();
    rawToggle!.click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")).toBe(wysiwygEditor);

    rawToggle!.click();
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

    const rawToggle = host.querySelector<HTMLInputElement>(".raw-mode-toggle input");
    expect(rawToggle).not.toBeNull();
    rawToggle!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    wysiwygEditor!.setSelectionRange(0, 0);
    rawToggle!.click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(rawEditor!.value).toBe("abXYZcdef");
    expect(rawEditor!.selectionStart).toBe(2);
    expect(rawEditor!.selectionEnd).toBe(5);

    dispose();
  });

  it("undoes WYSIWYG and raw edits in chronological order", async () => {
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

    const rawToggle = host.querySelector<HTMLInputElement>(".raw-mode-toggle input");
    expect(rawToggle).not.toBeNull();
    rawToggle!.click();
    await settle();

    const rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(rawEditor!.value).toBe("A");
    rawEditor!.value = "AB";
    rawEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    rawToggle!.click();
    await settle();

    expect(wysiwygEditor!.value).toBe("AB");
    wysiwygEditor!.value = "ABC";
    wysiwygEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(pressUndo(wysiwygEditor!)).toBe(true);
    await settle();
    expect(wysiwygEditor!.value).toBe("AB");

    expect(pressUndo(wysiwygEditor!)).toBe(true);
    await settle();
    expect(wysiwygEditor!.value).toBe("A");

    expect(pressUndo(wysiwygEditor!)).toBe(true);
    await settle();
    expect(wysiwygEditor!.value).toBe("");
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!.value).toBe("");

    dispose();
  });
});

function dialog(host: ParentNode, title: string): Element | null {
  return Array.from(host.querySelectorAll("[role='dialog']")).find((element) => element.textContent?.includes(title)) ?? null;
}

function button(host: ParentNode, label: string): HTMLButtonElement | null {
  return Array.from(host.querySelectorAll("button")).find((element) => element.textContent === label) ?? null;
}

function clickButton(host: ParentNode, label: string): void {
  const element = button(host, label);
  expect(element).not.toBeNull();
  element!.click();
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

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}
