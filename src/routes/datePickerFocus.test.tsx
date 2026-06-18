import { render } from "solid-js/web";
import Home from "./index";

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

vi.mock("~/components/MilkdownEditor", () => ({
  MilkdownEditor: () => null
}));

vi.mock("~/storage/localDraftStore", () => ({
  IndexedDbLocalDraftStore: class {
    async load() {
      return null;
    }

    async listExistingDailyNoteDates() {
      return ["2030-02-01"];
    }

    async listDirty() {
      return [];
    }

    async save() {
      return undefined;
    }

    async saveIfUnchanged() {
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
    dirty
  })
}));

vi.mock("~/storage/fakeRemoteStorage", async () => {
  const { DEFAULT_JOT_SETTINGS } = await vi.importActual<typeof import("~/domain/settings")>("~/domain/settings");

  class FakeRemoteStorageProvider {
    async loadDailyNote() {
      return null;
    }

    async listDailyNoteDates() {
      return ["2030-02-01"];
    }

    async saveDailyNote(input: { readonly date: string; readonly markdown: string }) {
      return {
        type: "saved",
        note: {
          date: input.date,
          markdown: input.markdown,
          revisionId: "test-revision",
          updatedAt: "2030-01-01T00:00:00.000Z"
        }
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

describe("Home date picker focus behavior", () => {
  beforeEach(() => {
    window.location.hash = "#/date/2030-02-01";
    localStorage.setItem("jot.fakeAuth", "true");
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    window.location.hash = "";
  });

  it("shows the date picker only while the date field or picker has focus", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const dateInput = host.querySelector<HTMLInputElement>(".iso-date-input");
    expect(dateInput).not.toBeNull();
    expect(host.querySelector(".date-picker-toggle")).toBeNull();
    expect(datePicker(host)).toBeNull();
    expect(dateInput!.getAttribute("aria-expanded")).toBe("false");

    focusElement(dateInput!);
    await settle();

    expect(datePicker(host)).not.toBeNull();
    expect(dateInput!.getAttribute("aria-expanded")).toBe("true");

    const nextMonth = button(host, "Next month");
    focusElement(nextMonth, dateInput!);
    await settle();

    expect(datePicker(host)).not.toBeNull();
    expect(dateInput!.getAttribute("aria-expanded")).toBe("true");

    const nextDay = button(host, "Next day");
    focusElement(nextDay, nextMonth);
    await settle();

    expect(datePicker(host)).toBeNull();
    expect(dateInput!.getAttribute("aria-expanded")).toBe("false");

    focusElement(dateInput!, nextDay);
    await settle();
    expect(datePicker(host)).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await settle();

    expect(datePicker(host)).toBeNull();
    expect(dateInput!.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).not.toBe(dateInput);

    dispose();
  });
});

function datePicker(host: ParentNode): Element | null {
  return host.querySelector(".date-picker-popover");
}

function button(host: ParentNode, label: string): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
  expect(element).not.toBeNull();
  return element!;
}

function focusElement(element: HTMLElement, previous: HTMLElement | null = null): void {
  previous?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: element }));
  element.focus();
  element.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: previous }));
  element.dispatchEvent(new FocusEvent("focus", { relatedTarget: previous }));
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}
