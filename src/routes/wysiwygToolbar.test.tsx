import { render } from "solid-js/web";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, SaveDailyNoteInput } from "~/storage/types";
import Home from "./index";

const testState = vi.hoisted(() => ({
  remoteNote: null as null | {
    readonly date: string;
    readonly markdown: string;
    readonly revisionId: string;
    readonly updatedAt: string;
  }
}));

vi.mock("~/config", () => ({
  APP_VERSION: "test",
  ENABLE_FAKE_AUTH: true,
  FORCE_FAKE_STORAGE: true,
  GOOGLE_CLIENT_ID: "",
  LOCAL_DRAFT_DEBOUNCE_MS: 250
}));

vi.mock("~/storage/localDraftStore", () => ({
  IndexedDbLocalDraftStore: class {
    async load() {
      return null;
    }

    async listExistingDailyNoteDates() {
      return [];
    }

    async listDirty() {
      return [];
    }

    async save() {
      return undefined;
    }

    async saveIfUnchanged(_date: IsoDate, _expected: LocalDraft | null, _draft: LocalDraft) {
      return true;
    }

    async remove() {
      return undefined;
    }

    async clearAll() {
      return undefined;
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

  class FakeRemoteStorageProvider {
    async loadDailyNote(date: IsoDate) {
      return testState.remoteNote?.date === date ? testState.remoteNote : null;
    }

    async listDailyNoteDates() {
      return testState.remoteNote === null ? [] : [testState.remoteNote.date];
    }

    async saveDailyNote(input: SaveDailyNoteInput) {
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

describe("Home WYSIWYG toolbar", () => {
  beforeAll(() => {
    const rect = () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: Array.prototype[Symbol.iterator] });

    Object.defineProperty(Text.prototype, "getBoundingClientRect", { value: rect, configurable: true });
    Object.defineProperty(Text.prototype, "getClientRects", { value: rects, configurable: true });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: rect, configurable: true });
    Object.defineProperty(Range.prototype, "getClientRects", { value: rects, configurable: true });
  });

  beforeEach(() => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "quote me",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    window.location.hash = "#/date/2030-02-02";
    localStorage.setItem("jot.fakeAuth", "true");
  });

  afterEach(() => {
    document.body.replaceChildren();
    document.getSelection()?.removeAllRanges();
    localStorage.clear();
    window.location.hash = "";
  });

  it("quotes a collapsed WYSIWYG text line from the first character without escaping the marker", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);

    try {
      const editor = await waitForEditable(host, "quote me");
      const text = findTextDomNode(editor, "quote me");
      expect(text).not.toBeNull();
      setCollapsedSelection(text!, 0);

      const quoteButton = button(host, "Toggle block quote format");
      expect(quoteButton.dispatchEvent(pointerDownEvent())).toBe(false);
      quoteButton.click();
      await settle();

      button(host, "Toggle raw Markdown").click();

      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>(".plain-text-editor")?.value).toBe("> quote me");
      });
    } finally {
      dispose();
    }
  });

  it("turns a normal WYSIWYG text line into a checkbox line from the toolbar", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "plain",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);

    try {
      const editor = await waitForEditable(host, "plain");
      const text = findTextDomNode(editor, "plain");
      expect(text).not.toBeNull();
      setCollapsedSelection(text!, "pla".length);

      const checkboxButton = button(host, "Toggle task checkbox");
      expect(checkboxButton.dispatchEvent(pointerDownEvent())).toBe(false);
      checkboxButton.click();
      await settle();

      button(host, "Toggle raw Markdown").click();

      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>(".plain-text-editor")?.value).toBe("* [ ] plain");
      });
    } finally {
      dispose();
    }
  });
});

function button(host: ParentNode, label: string): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
  expect(element).not.toBeNull();
  return element!;
}

async function waitForEditable(host: ParentNode, text: string): Promise<HTMLElement> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const editor = host.querySelector<HTMLElement>("[contenteditable='true']");
    if (editor !== null && editor.textContent?.includes(text)) return editor;
    await animationFrame();
  }
  throw new Error("Milkdown editor did not render.");
}

function setCollapsedSelection(text: Text, offset: number): void {
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function findTextDomNode(root: HTMLElement, textToFind: string): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    if (node.textContent?.includes(textToFind)) return node as Text;
    node = walker.nextNode();
  }
  return null;
}

function pointerDownEvent(): PointerEvent {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function waitFor(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 5000) {
    try {
      assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
      await settle();
    }
  }
  throw lastError;
}
