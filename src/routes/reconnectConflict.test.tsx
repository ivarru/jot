import { render } from "solid-js/web";
import { dayOfWeek, todayIsoDate, type IsoDate } from "~/domain/dates";
import { DEFAULT_JOT_SETTINGS } from "~/domain/settings";
import { shortcutLabelsForPlatform } from "~/editor/editorModeShortcut";
import type { LocalDraft } from "~/storage/types";
import {
  cleanupRouteTestDom,
  getRouteTestState,
  resetRouteTestState,
  type Deferred,
  type DelayedClearAll,
  type DelayedDraftLoad,
  type DelayedRemoteLoad,
  type DelayedRemoteSave
} from "./routeTestHarness.test-helper";
import Home from "./index";

const testState = getRouteTestState();

describe("Home reconnect and conflict handling", () => {
  beforeEach(() => {
    resetRouteTestState();
  });

  afterEach(() => {
    cleanupRouteTestDom();
  });

  it("retries production renewal for date B after date A's renewal save finishes stale", async () => {
    testState.useGoogleRuntime = true;
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "A original",
      revisionId: "a-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "B original"));
    testState.delayedRemoteSave = delayedRemoteSave("2030-02-02");
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("A original");
      });
      testState.googleRenewalDue = true;
      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
      editor.value = "A changed";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " changed" }));
      await testState.delayedRemoteSave.started.promise;

      clickButton(host, "Next day");
      await waitFor(() => {
        expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")?.value).toBe("2030-02-03");
      });
      testState.delayedRemoteSave.finish.resolve();

      await waitFor(() => expect(testState.googleRenewalAttempts).toBe(1));
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("B original");
    } finally {
      testState.delayedRemoteSave?.finish.resolve();
      dispose();
    }
  });

  it("renews after a retryable background-draft failure is successfully retried", async () => {
    testState.useGoogleRuntime = true;
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "A original",
      revisionId: "a-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await waitFor(() => expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Synced"));
      testState.drafts.set("2030-02-04", {
        ...draft("2030-02-04", "background edit"),
        dirty: true
      });
      testState.remoteSaveFailureDate = "2030-02-04";
      testState.remoteSaveFailuresRemaining = 1;
      testState.googleRenewalDue = true;
      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
      editor.value = "A renewal trigger";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " renewal trigger" }));

      await waitFor(() => expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Sync error"));
      expect(testState.googleRenewalAttempts).toBe(0);
      const recoveryDraft = testState.drafts.get("2030-02-02")!;
      const delayedRecoveryLoad = delayedDraftLoad("2030-02-02", recoveryDraft);
      testState.delayedDraftLoad = delayedRecoveryLoad;
      host.querySelector<HTMLButtonElement>(".sync-status")!.click();
      await delayedRecoveryLoad.started.promise;
      editor.value = "A changed during recovery";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " changed during recovery" }));
      delayedRecoveryLoad.finish.resolve();

      await waitFor(() => expect(testState.googleRenewalAttempts).toBe(1));
      expect(testState.drafts.get("2030-02-04")?.dirty).toBe(false);
      expect(testState.remoteNote).toMatchObject({
        date: "2030-02-02",
        markdown: "A changed during recovery"
      });
      expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Synced");
    } finally {
      testState.delayedDraftLoad?.finish.resolve();
      dispose();
    }
  });

  it("syncs an editor change made before its local-persist debounce fires", async () => {
    testState.useGoogleRuntime = true;
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "A original",
      revisionId: "a-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    testState.googleRenewalFailuresRemaining = 1;
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await waitFor(() => expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Synced"));
      testState.googleRenewalDue = true;
      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
      editor.value = "A typed just before renewal";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " typed just before renewal" }));

      await waitFor(() => {
        expect(dialog(host, "Reconnect to sync")?.textContent).toContain("latest edits are synced");
      });
      expect(testState.remoteNote).toMatchObject({
        date: "2030-02-02",
        markdown: "A typed just before renewal"
      });
      expect(testState.drafts.get("2030-02-02")?.dirty).toBe(false);
    } finally {
      dispose();
    }
  });

  it("syncs edits typed while renewal is synchronizing background drafts before reporting success", async () => {
    testState.useGoogleRuntime = true;
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "A original",
      revisionId: "a-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.drafts.set("2030-02-02", draft("2030-02-02", "A original"));
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await waitFor(() => expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Synced"));
      testState.drafts.set("2030-02-04", {
        ...draft("2030-02-04", "background edit"),
        dirty: true
      });
      testState.delayedRemoteSave = delayedRemoteSave("2030-02-04");
      testState.googleRenewalFailuresRemaining = 1;
      testState.googleRenewalDue = true;
      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
      editor.value = "A renewal trigger";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " renewal trigger" }));
      await testState.delayedRemoteSave.started.promise;

      editor.value = "A original plus newest edit";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " plus newest edit" }));
      testState.delayedRemoteSave.finish.resolve();

      await waitFor(() => {
        expect(dialog(host, "Reconnect to sync")?.textContent).toContain("latest edits are synced");
      });
      expect(testState.googleTokenInvalidations).toBe(1);
      expect(testState.drafts.get("2030-02-02")).toMatchObject({
        markdown: "A original plus newest edit",
        dirty: false
      });
      expect(testState.remoteNote).toMatchObject({
        date: "2030-02-02",
        markdown: "A original plus newest edit"
      });
    } finally {
      testState.delayedRemoteSave?.finish.resolve();
      dispose();
    }
  });

  it("persists a note that becomes editable after renewal begins without a visible snapshot", async () => {
    testState.useGoogleRuntime = true;
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "A original",
      revisionId: "a-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const delayedSettings = {
      result: DEFAULT_JOT_SETTINGS,
      started: deferred<void>(),
      finish: deferred<void>()
    };
    const delayedLocal = delayedDraftLoad("2030-02-02", draft("2030-02-02", "A original"));
    const delayedDirtyList = {
      started: deferred<void>(),
      finish: deferred<void>(),
      consumed: false
    };
    testState.delayedSettingsLoad = delayedSettings;
    testState.delayedDraftLoad = delayedLocal;
    testState.delayedDirtyList = delayedDirtyList;
    testState.googleRenewalDue = true;
    testState.googleRenewalFailuresRemaining = 1;
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await delayedDirtyList.started.promise;
      delayedLocal.finish.resolve();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("A original");
      });
      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
      editor.value = "A became editable during renewal";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: " became editable during renewal" }));
      delayedDirtyList.finish.resolve();

      await waitFor(() => {
        expect(dialog(host, "Reconnect to sync")?.textContent).toContain("saved locally but could not be synced");
      });
      expect(testState.drafts.get("2030-02-02")).toMatchObject({
        markdown: "A became editable during renewal",
        dirty: true
      });
    } finally {
      delayedSettings.finish.resolve();
      delayedLocal.finish.resolve();
      delayedDirtyList.finish.resolve();
      dispose();
    }
  });

  it("opens the reconnect modal before showing inline reconnect affordances after background auth expiry", async () => {
    testState.loadAuthError = true;
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    expect(host.textContent).toContain("Reconnect to sync");
    expect(dialog(host, "Reconnect to sync")).not.toBeNull();
    expect(host.querySelector(".sync-alert-auth")).toBeNull();

    clickButton(host, "Not now");
    await settle();

    expect(dialog(host, "Reconnect to sync")).toBeNull();
    expect(host.querySelector(".sync-alert-auth")).not.toBeNull();
    expect(button(host, "Reconnect")).not.toBeNull();

    dispose();
  });

  it("keeps the reconnect-required status disk red after a local-only edit", async () => {
    testState.loadAuthError = true;
    testState.drafts.set("2030-02-02", draft("2030-02-02", "before expiry"));
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await settle();
      clickButton(host, "Not now");
      await waitFor(() => expect(host.querySelector("textarea[aria-label='Mock WYSIWYG editor']")).not.toBeNull());
      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
      editor.value = "saved only on this Mac";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "saved only on this Mac" }));
      editor.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

      await waitFor(() => {
        const sync = host.querySelector<HTMLButtonElement>(".sync-status");
        expect(sync?.getAttribute("aria-label")).toContain("Reconnect required");
        expect(sync?.classList.contains("sync-status-alert")).toBe(true);
      });
    } finally {
      dispose();
    }
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
    localStorage.setItem("jot.tagSuggestions.v1", JSON.stringify({
      known: ["private-project"],
      dismissed: ["mistake"]
    }));

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
    expect(localStorage.getItem("jot.tagSuggestions.v1")).toBeNull();

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

  it("copies redacted diagnostics and pauses their collection with a sync conflict", async () => {
    testState.saveConflict = true;
    testState.drafts.set("2030-02-02", {
      date: "2030-02-02",
      markdown: "before\nlocal secret\nafter\n",
      baselineMarkdown: "before\nold\nafter\n",
      baselineRevisionId: "baseline-revision",
      dirty: true,
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (value: string) => Promise.resolve(copied = value) }
    });
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await settle();
      clickButton(host, "Open menu");
      clickButton(host, "Settings");
      const diagnosticsEnabled = host.querySelector<HTMLInputElement>(
        "input[aria-label='Collect sync diagnostics for conflict reports']"
      );
      expect(diagnosticsEnabled).not.toBeNull();
      diagnosticsEnabled!.checked = true;
      diagnosticsEnabled!.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
      expect(testState.savedSettings.at(-1)).toMatchObject({ syncDiagnosticsEnabled: true });

      clickButton(host, "Saved locally");
      await settle();
      expect(dialog(host, "Sync conflict")).not.toBeNull();

      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
      expect(editor?.readOnly).toBe(true);
      expect(button(host, "Copy sync diagnostics")?.disabled).toBe(false);
      clickButton(host, "Copy sync diagnostics");
      await settle();
      expect(copied).toContain("Jot test sync diagnostics");
      expect(copied).toContain("sync-conflict");
      expect(copied).not.toContain("local secret");
      expect(copied).not.toContain("baseline-revision");
      const beforeRejectedEdit = copied;

      editor!.value = "after conflict";
      editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
      clickButton(host, "Copy sync diagnostics");
      await settle();
      expect(copied).toBe(beforeRejectedEdit);
      expect(testState.drafts.get("2030-02-02")?.markdown).toBe("before\nlocal secret\nafter\n");
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
    }
  });

  it("offers placeholder normalization by default and closes settings with its close button", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await settle();
      clickButton(host, "Open menu");
      clickButton(host, "Settings");

      expect(host.querySelector<HTMLInputElement>(
        "input[aria-label='Normalize empty editor placeholders when saving']"
      )?.checked).toBe(true);
      expect(host.querySelector<HTMLInputElement>(
        "input[aria-label='Collect sync diagnostics for conflict reports']"
      )?.checked).toBe(false);

      clickButton(host, "Close settings");
      expect(host.querySelector(".settings-panel")).toBeNull();
    } finally {
      dispose();
    }
  });

  it("waits for the diagnostics preference before initially syncing dirty drafts", async () => {
    const settingsLoad = deferred<void>();
    const settingsStarted = deferred<void>();
    const remoteSaveStarted = deferred<void>();
    const remoteSaveFinish = deferred<void>();
    testState.delayedSettingsLoad = {
      result: { ...DEFAULT_JOT_SETTINGS, syncDiagnosticsEnabled: true },
      started: settingsStarted,
      finish: settingsLoad
    };
    testState.drafts.set("2030-02-03", {
      date: "2030-02-03",
      markdown: "local draft",
      baselineMarkdown: "before",
      baselineRevisionId: "baseline-revision",
      dirty: true,
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    testState.delayedRemoteSave = {
      date: "2030-02-03",
      started: remoteSaveStarted,
      finish: remoteSaveFinish,
      consumed: false
    };
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await settingsStarted.promise;
      await settle();
      expect(testState.delayedRemoteSave.consumed).toBe(false);

      settingsLoad.resolve();
      await remoteSaveStarted.promise;
      expect(testState.delayedRemoteSave.consumed).toBe(true);
    } finally {
      remoteSaveFinish.resolve();
      dispose();
    }
  });

  it("opens the link modal at the editor cursor from the heading button", async () => {
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

    const linkButton = host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']");
    expect(linkButton).not.toBeNull();
    expect(linkButton!.getAttribute("data-tooltip")).toBe(
      `Insert or edit link (${shortcutLabelsForPlatform(navigator.platform).linkEdit})`
    );
    linkButton!.click();
    await settle();

    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
    expect(inputs.map((input) => input.value)).toEqual([
      "sync-model (example.com)",
      "https://example.com/docs/sync-model"
    ]);
    clickButton(host, "Update");
    await settle();

    expect(editor!.value).toBe("Read [sync-model (example.com)](<https://example.com/docs/sync-model>) today");

    dispose();
  });

  it("opens the link modal at the raw editor selection with Ctrl+K", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Read selected text today",
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
    editor!.setSelectionRange("Read ".length, "Read selected text".length);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "k",
      ctrlKey: true
    });
    editor!.dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(dialog(host, "Insert link")).not.toBeNull();
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
    expect(inputs.map((input) => input.value)).toEqual(["selected text", ""]);

    dispose();
  });

  it("inserts a tag at the raw editor cursor with Ctrl+Alt+K", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Review this",
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
    editor!.setSelectionRange(editor!.value.length, editor!.value.length);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      altKey: true
    });
    editor!.dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(dialog(host, "Add tag")).not.toBeNull();
    const input = host.querySelector<HTMLInputElement>(".tag-modal input");
    expect(input).not.toBeNull();
    input!.value = "Follow Up";
    input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    host.querySelector<HTMLButtonElement>(".tag-modal button[type='submit']")!.click();
    await settle();

    expect(editor!.value).toBe("Review this [#follow-up](jot:tag/follow-up)");
    dispose();
  });

  it("moves to the next and previous Daily Note from the editor shortcuts", async () => {
    testState.drafts.set("2030-02-01", draft("2030-02-01", "Previous day"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "Next day"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    rawModeButton(host).click();
    await settle();
    const initialRawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!;
    initialRawEditor.value = "Saved before shortcut navigation";
    initialRawEditor.dispatchEvent(new InputEvent("input", { bubbles: true }));

    const nextEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "n",
      code: "KeyN",
      ctrlKey: true,
      altKey: true
    });
    host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!.dispatchEvent(nextEvent);
    await waitFor(() => {
      expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
    });
    expect(nextEvent.defaultPrevented).toBe(true);

    const previousEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "p",
      code: "KeyP",
      ctrlKey: true,
      altKey: true
    });
    host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!.dispatchEvent(previousEvent);
    await waitFor(() => {
      expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-02");
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!.value).toBe(
        "Saved before shortcut navigation"
      );
    });
    expect(previousEvent.defaultPrevented).toBe(true);

    dispose();
  });

  it("does not open the tag picker inside Markdown links or inline code", async () => {
    const source = "Read [the docs](https://example.com) and `sample code`";
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: source,
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!;
    const tagButton = host.querySelector<HTMLButtonElement>("button[aria-label='Add tag']")!;

    editor.setSelectionRange(source.indexOf("the docs") + 2, source.indexOf("the docs") + 2);
    tagButton.click();
    await settle();
    expect(dialog(host, "Add tag")).toBeNull();

    editor.setSelectionRange(source.indexOf("sample code") + 2, source.indexOf("sample code") + 2);
    tagButton.click();
    await settle();
    expect(dialog(host, "Add tag")).toBeNull();
    expect(editor.value).toBe(source);
    expect(localStorage.getItem("jot.tagSuggestions.v1")).toBeNull();

    dispose();
  });

  it("does not open the tag picker at any insertion point in a heading", async () => {
    const source = "Lead paragraph\n\n# Important heading\n\nParagraph";
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: source,
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!;
    const tagButton = host.querySelector<HTMLButtonElement>("button[aria-label='Add tag']")!;
    const headingStart = source.indexOf("#");
    editor.setSelectionRange(0, headingStart);
    tagButton.click();
    await settle();
    expect(dialog(host, "Add tag")).toBeNull();

    for (const offset of [headingStart, source.indexOf("heading") + 2, source.indexOf("\n", headingStart)]) {
      editor.setSelectionRange(offset, offset);
      tagButton.click();
      await settle();
      expect(dialog(host, "Add tag")).toBeNull();
    }
    expect(editor.value).toBe(source);

    dispose();
  });

  it("still initializes when reading the localStorage property throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked", "SecurityError");
      }
    });
    const host = document.createElement("div");
    document.body.append(host);

    let dispose: (() => void) | undefined;
    try {
      dispose = render(() => <Home />, host);
      expect(host.textContent).toContain("Jot");
    } finally {
      dispose?.();
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, "localStorage");
      } else {
        Object.defineProperty(globalThis, "localStorage", descriptor);
      }
    }
  });

  it("discovers suggestions on note load without parsing tag-like edits on every keystroke", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Review",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!;
    editor.value = "Review [#typed](jot:tag/typed)";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();
    clickButton(host, "Add tag");
    await settle();

    expect(host.querySelector("button[aria-label='#typed']")).toBeNull();
    expect(editor.value).toBe("Review [#typed](jot:tag/typed)");

    dispose();
  });

  it("suggests tags from notes and can hide a mistaken suggestion without editing the note", async () => {
    const source = "Review [#research](jot:tag/research) [#mistake](jot:tag/mistake)";
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: source,
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    clickButton(host, "Add tag");
    await settle();

    expect(button(host, "#research")).not.toBeNull();
    expect(button(host, "#mistake")).not.toBeNull();
    clickButton(host, "Remove #mistake from suggestions");
    await settle();

    expect(host.querySelector("button[aria-label='#mistake']")).toBeNull();
    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor?.value).toBe(source);

    clickButton(host, "Cancel");
    clickButton(host, "Add tag");
    await settle();
    expect(host.querySelector("button[aria-label='#mistake']")).toBeNull();
    expect(button(host, "#research")).not.toBeNull();

    dispose();
  });

  it("filters tag suggestions by prefix and selects them with the arrow keys", async () => {
    const source = [
      "Tags: [#research](jot:tag/research) [#release-notes](jot:tag/release-notes)",
      "[#testing](jot:tag/testing)"
    ].join(" ");
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: source,
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    clickButton(host, "Add tag");
    await settle();

    const input = host.querySelector<HTMLInputElement>(".tag-modal input")!;
    input.value = "Re";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    expect(host.querySelector("button[aria-label='#research']")).not.toBeNull();
    expect(host.querySelector("button[aria-label='#release-notes']")).not.toBeNull();
    expect(host.querySelector("button[aria-label='#testing']")).toBeNull();

    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
    await settle();
    expect(input.value).toBe("research");
    expect(host.querySelector("[role='option'][aria-selected='true']")?.textContent).toContain("#research");

    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
    await settle();
    expect(input.value).toBe("release-notes");
    expect(host.querySelector("[role='option'][aria-selected='true']")?.textContent).toContain("#release-notes");

    dispose();
  });

  it("does not open the link modal with Ctrl+K outside the editor", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "Read selected text today",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "k",
      ctrlKey: true
    });
    host.dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(dialog(host, "Insert link")).toBeNull();

    dispose();
  });

  it("saves the latest WYSIWYG markdown when the tab is hidden before the editor change propagates", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "after step 1",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await waitFor(() => {
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("after step 1");
    });

    testState.setWysiwygInternalMarkdown?.("after step 3 with local edits");
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(testState.remoteNote?.markdown).toBe("after step 3 with local edits");
    });
    expect(testState.drafts.get("2030-02-02")?.markdown).toBe("after step 3 with local edits");

    setDocumentVisibility("visible");
    dispose();
  });

  it("focuses the last-focused editor once when duplicate foreground events start a delayed refresh", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "before app switch",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
    editor.focus();

    window.dispatchEvent(new Event("blur"));
    editor.blur();
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Synced");
    });
    testState.delayedRemoteLoad = delayedRemoteLoad("2030-02-02", testState.remoteNote);
    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));

    await testState.delayedRemoteLoad.started.promise;
    expect(testState.focusCurrentSelectionCount).toBe(1);
    expect(document.activeElement).toBe(editor);

    editor.value = "before app switchA";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: "A", inputType: "insertText" }));
    testState.delayedRemoteLoad.finish.resolve();
    await settle();

    expect(testState.focusCurrentSelectionCount).toBe(1);
    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe("before app switchA");

    dispose();
  });

  it("ignores a return refresh for date A after navigation to date B", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "date A",
      revisionId: "remote-revision-a",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.drafts.set("2030-02-03", draft("2030-02-03", "date B"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    const editorA = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
    editorA.focus();

    window.dispatchEvent(new Event("blur"));
    editorA.blur();
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(host.querySelector(".sync-status")?.getAttribute("aria-label")).toContain("Synced");
    });
    testState.delayedRemoteLoad = delayedRemoteLoad("2030-02-02", {
      date: "2030-02-02",
      markdown: "stale date A",
      revisionId: "stale-revision-a",
      updatedAt: "2030-01-02T00:00:00.000Z"
    });
    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await testState.delayedRemoteLoad.started.promise;

    window.location.hash = "#/date/2030-02-03";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")?.value).toBe("2030-02-03");
    });
    testState.delayedRemoteLoad.finish.resolve();
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("date B");
    expect(testState.focusCurrentSelectionCount).toBe(1);

    dispose();
  });

  it("syncs a propagated edit on pagehide before the autosave debounce fires", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "before app switch",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await waitFor(() => {
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(
        "before app switch"
      );
    });

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.value = "saved while switching apps";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();

    window.dispatchEvent(new PageTransitionEvent("pagehide"));

    await waitFor(() => {
      expect(testState.remoteNote?.markdown).toBe("saved while switching apps");
    });
    expect(testState.drafts.get("2030-02-02")?.markdown).toBe("saved while switching apps");

    dispose();
  });

  it("does not submit a stale link modal after date navigation", async () => {
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read <https://example.com/docs/sync-model> today"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "Next day note"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();
    await waitFor(() => {
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe(
        "Read <https://example.com/docs/sync-model> today"
      );
    });

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("Read <https://example".length, "Read <https://example".length);
    editor!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
    await settle();

    expect(dialog(host, "Edit link")).not.toBeNull();

    host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
    await waitFor(() => {
      expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Next day note");
    });

    clickButton(host, "Update");
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Next day note");
    expect(host.textContent).toContain("The Daily Note changed. Reopen the link editor.");

    dispose();
  });

  it("does not open a stale link modal after a delayed clipboard read and date navigation", async () => {
    const clipboardText = deferred<string>();
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    let readRequested = false;
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: () => Promise.resolve({ state: "granted" })
      },
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => {
          readRequested = true;
          return clipboardText.promise;
        }
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read this"));
    testState.drafts.set("2030-02-03", draft("2030-02-03", "Next day note"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Read this");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
      await settle();
      expect(readRequested).toBe(true);

      host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
      await waitFor(() => {
        expect(host.querySelector<HTMLInputElement>("input[aria-label='Selected date']")!.value).toBe("2030-02-03");
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Next day note");
      });

      clipboardText.resolve("https://example.com/from-clipboard");
      await settle();

      expect(dialog(host, "Insert link")).toBeNull();
      expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Next day note");
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      if (originalPermissions === undefined) {
        Reflect.deleteProperty(navigator, "permissions");
      } else {
        Object.defineProperty(navigator, "permissions", originalPermissions);
      }
    }
  });

  it("auto-fills empty link modal fields after a user-triggered clipboard read", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    let readRequested = false;
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: () => Promise.resolve({ state: "prompt" })
      },
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => {
          readRequested = true;
          return Promise.resolve("https://example.com/from-clipboard");
        }
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read this"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Read this");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
      await settle();

      expect(dialog(host, "Insert link")).not.toBeNull();
      expect(readRequested).toBe(true);
      const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
      expect(inputs.map((input) => input.value)).toEqual([
        "from-clipboard (example.com)",
        "https://example.com/from-clipboard"
      ]);
      const textButton = host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard text']");
      const urlButton = host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard URL']");
      expect(textButton?.disabled).toBe(false);
      expect(urlButton?.disabled).toBe(false);
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      if (originalPermissions === undefined) {
        Reflect.deleteProperty(navigator, "permissions");
      } else {
        Object.defineProperty(navigator, "permissions", originalPermissions);
      }
    }
  });

  it("auto-fills empty link modal fields from a granted clipboard suggestion", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    let readRequested = false;
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: () => Promise.resolve({ state: "granted" })
      },
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => {
          readRequested = true;
          return Promise.resolve("Clipboard title https://example.com/from-clipboard");
        }
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read this"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Read this");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
      await settle();

      expect(readRequested).toBe(true);
      const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
      expect(inputs.map((input) => input.value)).toEqual(["Clipboard title", "https://example.com/from-clipboard"]);
      expect(host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard text']")?.disabled).toBe(false);
      expect(host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard URL']")?.disabled).toBe(false);
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      if (originalPermissions === undefined) {
        Reflect.deleteProperty(navigator, "permissions");
      } else {
        Object.defineProperty(navigator, "permissions", originalPermissions);
      }
    }
  });

  it("uses clipboard buttons without automatically overwriting an existing link", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: () => Promise.resolve({ state: "granted" })
      },
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => Promise.resolve("Clipboard title https://example.com/new")
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read [old text](<https://example.com/old>) today"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe(
          "Read [old text](<https://example.com/old>) today"
        );
      });

      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
      expect(editor).not.toBeNull();
      editor!.setSelectionRange("Read [".length, "Read [old text".length);
      editor!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
      await settle();

      const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
      expect(inputs.map((input) => input.value)).toEqual(["old text", "https://example.com/old"]);

      host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard text']")!.click();
      await settle();
      expect(inputs.map((input) => input.value)).toEqual(["Clipboard title", "https://example.com/old"]);

      host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard URL']")!.click();
      await settle();
      expect(inputs.map((input) => input.value)).toEqual(["Clipboard title", "https://example.com/new"]);
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      if (originalPermissions === undefined) {
        Reflect.deleteProperty(navigator, "permissions");
      } else {
        Object.defineProperty(navigator, "permissions", originalPermissions);
      }
    }
  });

  it("keeps the link modal URL clipboard button disabled for text-only clipboard content", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: () => Promise.resolve({ state: "granted" })
      },
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => Promise.resolve("Clipboard title")
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read this"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Read this");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
      await settle();

      const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
      expect(inputs.map((input) => input.value)).toEqual(["Clipboard title", ""]);
      expect(host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard text']")?.disabled).toBe(false);
      expect(host.querySelector<HTMLButtonElement>("button[aria-label='Use clipboard URL']")?.disabled).toBe(true);
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      if (originalPermissions === undefined) {
        Reflect.deleteProperty(navigator, "permissions");
      } else {
        Object.defineProperty(navigator, "permissions", originalPermissions);
      }
    }
  });

  it("uses a pasted HTML link in the link modal address field", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions");
    let readRequested = false;
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: () => Promise.resolve({ state: "prompt" })
      },
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: () => {
          readRequested = true;
          return Promise.resolve("");
        }
      },
      configurable: true
    });
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Read this"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();
      await waitFor(() => {
        expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("Read this");
      });

      host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.click();
      await settle();

      const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
      expect(inputs.map((input) => input.value)).toEqual(["", ""]);
      expect(readRequested).toBe(true);
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: {
          getData: (type: string) =>
            type === "text/html"
              ? '<a href="https://example.com/page">Example page</a>'
              : type === "text/plain"
                ? "Example page"
                : ""
        }
      });
      inputs[1]!.dispatchEvent(paste);
      await settle();

      expect(inputs.map((input) => input.value)).toEqual(["Example page", "https://example.com/page"]);
    } finally {
      dispose();
      if (originalClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      if (originalPermissions === undefined) {
        Reflect.deleteProperty(navigator, "permissions");
      } else {
        Object.defineProperty(navigator, "permissions", originalPermissions);
      }
    }
  });

  it("opens the link modal from share target search params and appends the shared link", async () => {
    window.history.replaceState(
      null,
      "",
      "/?title=Shared+title&url=https%3A%2F%2Fexample.com%2Fshared#/date/2030-02-02"
    );
    testState.drafts.set("2030-02-02", draft("2030-02-02", "Existing note"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    await waitFor(() => expect(dialog(host, "Insert link")).not.toBeNull());
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>(".link-modal input"));
    expect(inputs.map((input) => input.value)).toEqual(["Shared title", "https://example.com/shared"]);

    const submit = Array.from(host.querySelectorAll<HTMLButtonElement>(".link-modal button")).find((element) =>
      element.textContent?.trim() === "Insert"
    );
    expect(submit).not.toBeNull();
    submit!.click();
    await settle();

    expect(host.textContent).not.toContain("The Daily Note changed. Reopen the link editor.");
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe(
      "Existing note\n\n[Shared title](<https://example.com/shared>)"
    );
    expect(window.location.search).toBe("");

    dispose();
  });

  it("inserts a Daily Note section link at the preserved WYSIWYG selection", async () => {
    testState.drafts.set("2030-02-01", draft("2030-02-01", "# Decisions\n\nBody"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.value = "See that decision";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editor!.setSelectionRange("See ".length, "See that decision".length);

    const insertButton = host.querySelector<HTMLButtonElement>("button[aria-label='Insert Daily Note section link']");
    expect(insertButton).not.toBeNull();
    insertButton!.dispatchEvent(pointerDownEvent());
    insertButton!.click();
    await settle();

    await waitFor(() => expect(sectionLinkDateButton(host, "2030-02-01").classList.contains("has-note")).toBe(true));
    sectionLinkDateButton(host, "2030-02-01").click();
    await settle();

    sectionHeadingButton(host, "Decisions").click();
    await settle();

    expect(editor!.value).toBe("See [that decision](#/date/2030-02-01#decisions)");

    dispose();
  });

  it("disables Daily Note section link insertion when the raw selection overlaps a link or code", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "See [decision](#/date/2030-02-01#decisions), `code`, and plain text.",
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
    const insertButton = host.querySelector<HTMLButtonElement>("button[aria-label='Insert Daily Note section link']");
    expect(editor).not.toBeNull();
    expect(insertButton).not.toBeNull();

    setRawSelection(editor!, editor!.value.indexOf("plain"), editor!.value.indexOf("plain"));
    await waitFor(() => expect(insertButton!.disabled).toBe(false));

    setRawSelection(editor!, editor!.value.indexOf("decision"), editor!.value.indexOf("decision"));
    await waitFor(() => expect(insertButton!.disabled).toBe(true));

    setRawSelection(editor!, editor!.value.indexOf("`code`") + 1, editor!.value.indexOf("`code`") + 1);
    await waitFor(() => expect(insertButton!.disabled).toBe(true));

    setRawSelection(editor!, editor!.value.indexOf("See "), editor!.value.indexOf("decision") + "decision".length);
    await waitFor(() => expect(insertButton!.disabled).toBe(true));

    dispose();
  });

  it("inserts a relative section link when the target heading is in the same Daily Note", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "# Decisions\n\nSee that decision",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("# Decisions\n\nSee ".length, "# Decisions\n\nSee that decision".length);

    const insertButton = host.querySelector<HTMLButtonElement>("button[aria-label='Insert Daily Note section link']");
    expect(insertButton).not.toBeNull();
    insertButton!.dispatchEvent(pointerDownEvent());
    insertButton!.click();
    await settle();

    sectionHeadingButton(host, "Decisions").click();
    await settle();

    expect(editor!.value).toBe("# Decisions\n\nSee [that decision](#decisions)");

    dispose();
  });

  it("does not insert a section link into a different selected date after a delayed heading load", async () => {
    testState.delayedDraftLoad = delayedDraftLoad("2030-02-01", draft("2030-02-01", "# Decisions\n\nBody"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']");
    expect(editor).not.toBeNull();
    editor!.value = "A source";
    editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editor!.setSelectionRange("A ".length, "A source".length);

    const insertButton = host.querySelector<HTMLButtonElement>("button[aria-label='Insert Daily Note section link']");
    expect(insertButton).not.toBeNull();
    insertButton!.dispatchEvent(pointerDownEvent());
    insertButton!.click();
    await settle();

    sectionLinkDateButton(host, "2030-02-01").click();
    await testState.delayedDraftLoad.started.promise;

    host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!.click();
    await settle();
    testState.delayedDraftLoad.finish.resolve();
    await settle();

    sectionHeadingButton(host, "Decisions").click();
    await settle();

    expect(host.textContent).toContain("The source Daily Note changed. Reopen the picker.");
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).not.toContain("#/date/2030-02-01#decisions");

    dispose();
  });

  it("opens the internal section link under the raw editor cursor with Ctrl+Enter", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "See [decision](#/date/2030-02-01#decisions)",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    testState.drafts.set("2030-02-01", draft("2030-02-01", "# Decisions\n\nBody"));
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    rawModeButton(host).click();
    await settle();

    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(editor).not.toBeNull();
    editor!.setSelectionRange("See [dec".length, "See [dec".length);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      ctrlKey: true
    });
    editor!.dispatchEvent(event);
    await waitFor(() => expect(window.location.hash).toBe("#/date/2030-02-01#decisions"));
    let targetEditor!: HTMLTextAreaElement;
    await waitFor(() => {
      targetEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']")!;
      expect(targetEditor.value).toBe("# Decisions\n\nBody");
    });

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(targetEditor.selectionStart).toBe("# ".length);
      expect(targetEditor.selectionEnd).toBe("# Decisions".length);
    });

    dispose();
  });

  it("opens external links with app-route-looking hashes outside Jot", async () => {
    const href = "https://example.com/#/date/2030-02-01#decisions";
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: `Read [external](${href})`,
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    try {
      await settle();

      rawModeButton(host).click();
      await settle();

      const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
      expect(editor).not.toBeNull();
      editor!.setSelectionRange("Read [external".length, "Read [external".length);
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        ctrlKey: true
      });
      editor!.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(href, "_blank", "noopener,noreferrer");
      expect(window.location.hash).toBe("#/date/2030-02-02");
    } finally {
      dispose();
      openSpy.mockRestore();
    }
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

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']");
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute("data-tooltip")).toBe("Toggle inline code format");
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

    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']")!.click();
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

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']");
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
    expect(toggle!.getAttribute("data-tooltip")).toBe("Toggle block quote format");
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

  it("prevents toolbar focus transfer without round-tripping the WYSIWYG selection", async () => {
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
      "Toggle inline code format",
      "Insert or edit link"
    ]) {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
      expect(button).not.toBeNull();
      const event = pointerDownEvent();
      expect(button!.dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
    }

    await settle();
    expect(testState.focusSelectionApplyCount).toBe(0);

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

    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']")!.click();
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

    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']");
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
    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']")!.click();
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
    const code = host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']");
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
    host.querySelector<HTMLButtonElement>("button[aria-label='Toggle inline code format']")!.click();
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
    expect(indent!.getAttribute("data-tooltip")).toBe("Indent (Tab)");
    indent!.click();
    await settle();

    expect(editor!.value).toBe("* before");

    editor!.setSelectionRange("* before".length, "* before".length);
    const dedent = host.querySelector<HTMLButtonElement>("button[aria-label='Dedent']");
    expect(dedent).not.toBeNull();
    expect(dedent!.getAttribute("data-tooltip")).toBe("Dedent (Shift+Tab)");
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

  it("orders toolbar buttons and places image insertion after raw mode in the left column", async () => {
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
      "Dedent",
      "Toggle task checkbox",
      "Indent",
      "Toggle italic format",
      "Toggle bold format",
      "Toggle block quote format",
      "Toggle inline code format",
      "Insert or edit link",
      "Add tag",
      "Insert Daily Note section link"
    ]);
    const dateContextLabels = Array.from(host.querySelectorAll(".date-context-row button")).map((element) =>
      element.getAttribute("aria-label")
    );
    expect(dateContextLabels).toEqual([
      `Jump to today, ${todayIsoDate()}`,
      "Toggle raw Markdown",
      "Insert image"
    ]);
    const todayButton = host.querySelector<HTMLButtonElement>(`button[aria-label='Jump to today, ${todayIsoDate()}']`);
    expect(todayButton).not.toBeNull();
    expect(todayButton!.disabled).toBe(false);
    expect(todayButton!.textContent).toBe(dayOfWeek("2030-02-02"));
    expect(todayButton!.getAttribute("data-tooltip")).toBe(`Jump to today (${dayOfWeek(todayIsoDate(), undefined, "long")})`);
    const shortcutLabels = shortcutLabelsForPlatform(navigator.platform);
    const previousDayButton = host.querySelector<HTMLButtonElement>("button[aria-label='Previous day']")!;
    const nextDayButton = host.querySelector<HTMLButtonElement>("button[aria-label='Next day']")!;
    expect(previousDayButton.getAttribute("data-tooltip")).toBe(`Previous day (${shortcutLabels.previousDay})`);
    expect(previousDayButton.getAttribute("aria-keyshortcuts")).toBe("Control+Alt+P Meta+Alt+P");
    expect(nextDayButton.getAttribute("data-tooltip")).toBe(`Next day (${shortcutLabels.nextDay})`);
    expect(nextDayButton.getAttribute("aria-keyshortcuts")).toBe("Control+Alt+N Meta+Alt+N");
    expect(rawModeButton(host).getAttribute("data-tooltip")).toBe(
      `Toggle raw Markdown (${shortcutLabels.editorModeToggle})`
    );
    expect(host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.getAttribute("data-tooltip")).toBe(
      `Insert or edit link (${shortcutLabels.linkEdit})`
    );
    expect(host.querySelector<HTMLButtonElement>("button[aria-label='Insert or edit link']")!.getAttribute("aria-keyshortcuts")).toBe(
      "Control+K Meta+K"
    );
    expect(host.querySelector<HTMLButtonElement>("button[aria-label='Add tag']")!.getAttribute("aria-keyshortcuts")).toBe(
      "Control+Alt+K Meta+Alt+K"
    );
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
    expect(todayButton!.textContent).toBe(dayOfWeek(today));
    expect(todayButton!.getAttribute("data-tooltip")).toBe(`Today (${dayOfWeek(today, undefined, "long")})`);

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

  it("keeps the status disk yellow while a local save is actively syncing", async () => {
    testState.drafts.set("2030-02-02", {
      date: "2030-02-02",
      markdown: "local draft",
      baselineMarkdown: "before",
      baselineRevisionId: "baseline-revision",
      dirty: true,
      updatedAt: "2030-01-01T00:00:00.000Z"
    });
    const remoteSaveStarted = deferred<void>();
    const remoteSaveFinish = deferred<void>();
    testState.delayedRemoteSave = {
      date: "2030-02-02",
      started: remoteSaveStarted,
      finish: remoteSaveFinish,
      consumed: false
    };
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Home />, host);

    try {
      await settle();
      clickButton(host, "Saved locally");
      await remoteSaveStarted.promise;
      const sync = host.querySelector<HTMLButtonElement>(".sync-status");
      expect(sync?.getAttribute("aria-label")).toContain("Syncing");
      expect(sync?.classList.contains("sync-status-local")).toBe(true);
    } finally {
      remoteSaveFinish.resolve();
      dispose();
    }
  });

  it("shows synced after checking Drive for a date with no existing note", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await waitFor(() => {
      const sync = host.querySelector<HTMLButtonElement>(".sync-status");
      expect(sync).not.toBeNull();
      expect(sync!.getAttribute("aria-label")).toContain("Synced");
      expect(sync!.classList.contains("sync-status-remote")).toBe(true);
    });

    expect(testState.remoteNote).toBeNull();
    expect(testState.drafts.get("2030-02-02")).toMatchObject({
      markdown: "",
      dirty: false
    });

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
    expect(undo!.getAttribute("data-tooltip")).toBe(
      `Undo (${shortcutLabelsForPlatform(navigator.platform).undo})`
    );
    undo!.click();
    await settle();

    expect(editor!.value).toBe("A");

    const redo = host.querySelector<HTMLButtonElement>("button[aria-label='Redo']");
    expect(redo).not.toBeNull();
    expect(redo!.getAttribute("data-tooltip")).toBe(
      `Redo (${shortcutLabelsForPlatform(navigator.platform).redo})`
    );
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

  it("clears raw undo history when a pending WYSIWYG edit is flushed on tab hide", async () => {
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "A",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    const rawToggle = rawModeButton(host);
    rawToggle.click();
    await settle();

    let rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    const undo = host.querySelector<HTMLButtonElement>("button[aria-label='Undo']");
    expect(rawEditor).not.toBeNull();
    expect(undo).not.toBeNull();
    rawEditor!.value = "AB";
    rawEditor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();
    expect(undo!.disabled).toBe(false);

    rawToggle.click();
    await settle();

    testState.setWysiwygInternalMarkdown?.("ABC");
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(testState.remoteNote?.markdown).toBe("ABC");
    });

    setDocumentVisibility("visible");
    rawToggle.click();
    await settle();

    rawEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Markdown text editor']");
    expect(rawEditor).not.toBeNull();
    expect(rawEditor!.value).toBe("ABC");
    expect(undo!.disabled).toBe(true);
    expect(pressUndo(rawEditor!)).toBe(false);
    await settle();
    expect(rawEditor!.value).toBe("ABC");

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

function sectionHeadingButton(host: ParentNode, heading: string): HTMLButtonElement {
  const element = Array.from(host.querySelectorAll<HTMLButtonElement>(".section-link-heading-button")).find((candidate) =>
    candidate.textContent?.includes(heading)
  );
  expect(element).not.toBeNull();
  return element!;
}

function sectionLinkDateButton(host: ParentNode, date: IsoDate): HTMLButtonElement {
  const element = Array.from(host.querySelectorAll<HTMLButtonElement>(".section-link-date-picker .date-picker-day")).find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(date)
  );
  expect(element).not.toBeNull();
  return element!;
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

function setRawSelection(editor: HTMLTextAreaElement, start: number, end: number): void {
  editor.setSelectionRange(start, end);
  editor.dispatchEvent(new Event("select", { bubbles: true }));
}

function pointerDownEvent(): PointerEvent {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

function setDocumentVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state
  });
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

function delayedRemoteLoad(
  date: IsoDate,
  result: DelayedRemoteLoad["result"]
): DelayedRemoteLoad {
  return {
    date,
    result,
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
