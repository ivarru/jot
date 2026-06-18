import { render } from "solid-js/web";
import type { IsoDate } from "~/domain/dates";
import type { LocalDraft, SaveDailyNoteInput } from "~/storage/types";
import Home from "./index";

const testState = vi.hoisted(() => ({
  drafts: new Map<string, LocalDraft>(),
  remoteNote: {
    date: "2030-02-02",
    markdown: "",
    revisionId: "remote-revision",
    updatedAt: "2030-01-01T00:00:00.000Z"
  } as {
    readonly date: string;
    readonly markdown: string;
    readonly revisionId: string;
    readonly updatedAt: string;
  } | null,
  savedSettings: [] as unknown[]
}));

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
  MilkdownEditor: (props: {
    readonly documentKey: string;
    readonly value: string;
    readonly readOnly?: boolean;
    readonly spellcheck?: boolean;
    readonly onChange: (documentKey: string, markdown: string) => void;
    readonly onBlur: (documentKey: string, markdown: string) => void;
  }) => (
    <textarea
      aria-label="Mock WYSIWYG editor"
      readOnly={props.readOnly === true}
      spellcheck={props.spellcheck !== false ? "true" : "false"}
      value={props.value}
      onInput={(event) => props.onChange(props.documentKey, event.currentTarget.value)}
      onBlur={(event) => props.onBlur(props.documentKey, event.currentTarget.value)}
    />
  )
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
      testState.savedSettings.push(settings);
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

describe("application menu", () => {
  beforeEach(() => {
    testState.drafts.clear();
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.savedSettings = [];
    window.location.hash = "#/date/2030-02-02";
    localStorage.setItem("jot.fakeAuth", "true");
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    window.location.hash = "";
  });

  it("places About first", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    openMenu(host);

    expect(Array.from(host.querySelectorAll(".top-menu-popover [role='menuitem']")).map((element) => element.textContent)).toEqual([
      "About Jot",
      "Upload daily notes",
      "Settings",
      "Turn spellcheck off",
      "Sign out"
    ]);

    dispose();
  });

  it("closes when clicking outside it", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    openMenu(host);
    expect(host.querySelector(".top-menu-popover")).not.toBeNull();

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await settle();

    expect(host.querySelector(".top-menu-popover")).toBeNull();

    dispose();
  });

  it("opens the About dialog with project metadata", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    openMenu(host);
    host.querySelectorAll<HTMLButtonElement>(".top-menu-popover [role='menuitem']")[0]!.click();
    await settle();

    const dialog = host.querySelector<HTMLElement>(".about-modal")!;
    expect(dialog.textContent).toContain("Version");
    expect(dialog.textContent).toContain("test");
    expect(dialog.textContent).toContain("Milkdown 7.21.1");
    expect(dialog.textContent).toContain("MIT");
    expect(dialog.textContent).toContain("Copyright (c) 2026 Test Author");

    const projectLink = dialog.querySelector<HTMLAnchorElement>("a")!;
    expect(projectLink.textContent).toBe("GitHub project");
    expect(projectLink.href).toBe("https://github.com/example/jot");
    expect(projectLink.target).toBe("_blank");
    expect(projectLink.rel).toBe("noreferrer noopener");

    dispose();
  });

  it("toggles browser spellcheck", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.getAttribute("spellcheck")).toBe(
      "true"
    );

    openMenu(host);
    clickButton(host, "Turn spellcheck off");
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.getAttribute("spellcheck")).toBe(
      "false"
    );
    expect(testState.savedSettings.at(-1)).toMatchObject({ spellcheck: false });

    openMenu(host);
    clickButton(host, "Turn spellcheck on");
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.getAttribute("spellcheck")).toBe(
      "true"
    );
    expect(testState.savedSettings.at(-1)).toMatchObject({ spellcheck: true });

    dispose();
  });
});

function openMenu(host: ParentNode): void {
  host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
}

function clickButton(host: ParentNode, label: string): void {
  const element = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.textContent?.includes(label)
  );
  expect(element).not.toBeNull();
  element!.click();
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}
