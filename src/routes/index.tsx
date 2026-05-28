import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import { ENABLE_FAKE_AUTH, LOCAL_DRAFT_DEBOUNCE_MS } from "~/config";
import { MilkdownEditor } from "~/components/MilkdownEditor";
import { SettingsPanel } from "~/components/SettingsPanel";
import { addDays, dayOfWeek, isToday, parseIsoDate, todayIsoDate, type IsoDate } from "~/domain/dates";
import { DEFAULT_JOT_SETTINGS, normalizeJotSettings, type JotSettings } from "~/domain/settings";
import {
  canEditSelectedDate,
  editorChangeTarget,
  shouldApplyLoadedNote,
  shouldApplySyncResult
} from "~/editor/dateBoundEditor";
import { FakeRemoteStorageProvider, loadSettingsOrDefault } from "~/storage/fakeRemoteStorage";
import { createDraft, IndexedDbLocalDraftStore } from "~/storage/localDraftStore";
import type { SyncStatus } from "~/storage/types";
import { loadDailyNoteSession, persistLocalDraft, syncDailyNote } from "~/sync/syncDailyNote";

const drafts = new IndexedDbLocalDraftStore();
const remote = new FakeRemoteStorageProvider();

export default function Home() {
  const [authenticated, setAuthenticated] = createSignal(
    ENABLE_FAKE_AUTH && globalThis.localStorage?.getItem("jot.fakeAuth") === "true"
  );
  const [selectedDate, setSelectedDate] = createSignal<IsoDate | null>(dateFromHash());
  const [invalidDate, setInvalidDate] = createSignal<string | null>(invalidDateFromHash());
  const [markdown, setMarkdown] = createSignal("");
  const [loadedDate, setLoadedDate] = createSignal<IsoDate | null>(null);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("local-only");
  const [settings, setSettings] = createSignal<JotSettings>(DEFAULT_JOT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [today, setToday] = createSignal(todayIsoDate());
  const [suppressLocalPersist, setSuppressLocalPersist] = createSignal(false);

  const weekday = createMemo(() => {
    const date = selectedDate();
    return date ? dayOfWeek(date) : "";
  });
  const selectedIsToday = createMemo(() => {
    const date = selectedDate();
    return date !== null && isToday(date);
  });
  const shouldOfferNewToday = createMemo(() => {
    const date = selectedDate();
    return date !== null && date !== today();
  });

  createEffect(() => {
    if (!authenticated()) return;

    void loadSettingsOrDefault(remote).then(setSettings);
  });

  createEffect(
    on(
      () => [authenticated(), selectedDate()] as const,
      ([isAuthenticated, date]) => {
        if (!isAuthenticated || date === null) return;

        setLoadedDate(null);
        replaceMarkdownFromStorage("");
        void loadDailyNoteSession(date, drafts, remote).then((session) => {
          if (!shouldApplyLoadedNote(date, selectedDate())) return;
          replaceMarkdownFromStorage(session.markdown);
          setLoadedDate(date);
          setSyncStatus(session.status);
        });
      },
      { defer: false }
    )
  );

  createEffect(
    on(markdown, (value) => {
      const date = selectedDate();
      if (!authenticated() || !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() }) || suppressLocalPersist()) return;
      if (date === null) return;

      const timeout = window.setTimeout(() => {
        void persistLocalDraft(date, value, drafts).then(setSyncStatus);
      }, LOCAL_DRAFT_DEBOUNCE_MS);

      onCleanup(() => window.clearTimeout(timeout));
    })
  );

  createEffect(
    on(
      () => [markdown(), settings().autosaveDebounceMs] as const,
      ([value]) => {
        const date = selectedDate();
        if (!authenticated() || !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() })) return;
        if (date === null) return;

        const timeout = window.setTimeout(() => {
          void flushAndSync(date, value);
        }, settings().autosaveDebounceMs);

        onCleanup(() => window.clearTimeout(timeout));
      }
    )
  );

  createEffect(() => {
    const interval = window.setInterval(() => setToday(todayIsoDate()), 60000);
    onCleanup(() => window.clearInterval(interval));
  });

  createEffect(() => {
    const onHashChange = () => {
      setSelectedDate(dateFromHash());
      setInvalidDate(invalidDateFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    onCleanup(() => window.removeEventListener("hashchange", onHashChange));
  });

  createEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      const date = selectedDate();
      if (date !== null) {
        const value = markdown();
        void persistLocalDraft(date, value, drafts);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  });

  const navigateToDate = async (date: IsoDate) => {
    const current = selectedDate();
    if (current !== null) {
      await persistLocalDraft(current, markdown(), drafts);
    }
    window.location.hash = `/date/${date}`;
  };

  const flushAndSync = async (date: IsoDate, value: string) => {
    setSyncStatus("syncing");
    await persistLocalDraft(date, value, drafts);
    const session = await syncDailyNote(date, drafts, remote).catch(() => null);
    if (session === null) {
      if (shouldApplySyncResult(date, selectedDate())) setSyncStatus("error");
      return;
    }
    if (shouldApplySyncResult(date, selectedDate())) {
      replaceMarkdownFromStorage(session.markdown);
      setSyncStatus(session.status);
    }
  };

  const replaceMarkdownFromStorage = (value: string) => {
    setSuppressLocalPersist(true);
    setMarkdown(value);
    queueMicrotask(() => setSuppressLocalPersist(false));
  };

  const updateSettings = (next: JotSettings) => {
    const normalized = normalizeJotSettings(next);
    setSettings(normalized);
    void remote.saveSettings(normalized);
  };

  const signOut = async () => {
    if (syncStatus() === "saved-locally" || syncStatus() === "conflict" || syncStatus() === "error") {
      const confirmed = window.confirm("Signing out will delete unsynced local data on this device.");
      if (!confirmed) return;
    }

    await drafts.clearAll();
    globalThis.localStorage?.removeItem("jot.fakeAuth");
    setAuthenticated(false);
    setMarkdown("");
    setSyncStatus("local-only");
  };

  return (
    <main class="app">
      <Show
        when={authenticated()}
        fallback={
          <section class="auth-screen">
            <h1>Jot</h1>
            <p>Google authentication is required before the first editor session.</p>
            <Show
              when={ENABLE_FAKE_AUTH}
              fallback={<p class="muted">Google OAuth will be wired after the fake-storage milestone.</p>}
            >
              <button
                type="button"
                onClick={() => {
                  globalThis.localStorage?.setItem("jot.fakeAuth", "true");
                  setAuthenticated(true);
                }}
              >
                Use development storage
              </button>
            </Show>
          </section>
        }
      >
        <Show
          when={selectedDate() !== null && invalidDate() === null}
          fallback={
            <section class="invalid-date">
              <h1>Invalid date</h1>
              <p>{invalidDate() ?? "The URL does not contain a valid date."}</p>
              <button type="button" onClick={() => void navigateToDate(todayIsoDate())}>
                Jump to today
              </button>
            </section>
          }
        >
          <header class="topbar">
            <div class="date-block">
              <div class="date-row">
                <button type="button" aria-label="Previous day" onClick={() => void navigateToDate(addDays(selectedDate()!, -1))}>
                  ‹
                </button>
                <input
                  type="date"
                  value={selectedDate()!}
                  onChange={(event) => {
                    const date = parseIsoDate(event.currentTarget.value);
                    if (date) void navigateToDate(date);
                  }}
                  aria-label="Selected date"
                />
                <button type="button" aria-label="Next day" onClick={() => void navigateToDate(addDays(selectedDate()!, 1))}>
                  ›
                </button>
              </div>
              <div class="date-meta">
                <strong>{selectedDate()}</strong>
                <span>{weekday()}</span>
                <span class={selectedIsToday() ? "today-pill" : "not-today-pill"}>
                  {selectedIsToday() ? "Today" : "Not today"}
                </span>
              </div>
            </div>
            <div class="top-actions">
              <span class={`sync-status sync-${syncStatus()}`}>{syncStatusLabel(syncStatus())}</span>
              <button type="button" onClick={() => setSettingsOpen((open) => !open)}>
                Settings
              </button>
              <button type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </header>

          <Show when={shouldOfferNewToday()}>
            <aside class="today-banner">
              The open note is not today in the current browser timezone.
              <button type="button" onClick={() => void navigateToDate(today())}>
                Jump to {today()}
              </button>
            </aside>
          </Show>

          <Show when={settingsOpen()}>
            <SettingsPanel settings={settings()} onChange={updateSettings} />
          </Show>

          <Show
            when={canEditSelectedDate({ selectedDate: selectedDate(), loadedDate: loadedDate() })}
            fallback={<div class="editor-loading">Loading note...</div>}
          >
            <MilkdownEditor
              documentKey={selectedDate()!}
              value={markdown()}
              onChange={(documentKey, value) => {
                const date = parseIsoDate(documentKey);
                if (date === null) return;
                if (editorChangeTarget(date, { selectedDate: selectedDate(), loadedDate: loadedDate() }) === "current-editor") {
                  setMarkdown(value);
                } else {
                  void persistLocalDraft(date, value, drafts);
                }
              }}
              onBlur={(documentKey, value) => {
              const date = parseIsoDate(documentKey);
              if (date === null) return;
              void persistLocalDraft(date, value, drafts).then((status) => {
                if (editorChangeTarget(date, { selectedDate: selectedDate(), loadedDate: loadedDate() }) === "current-editor") {
                  setSyncStatus(status);
                }
              });
              }}
            />
          </Show>
        </Show>
      </Show>
    </main>
  );
}

function dateFromHash(): IsoDate | null {
  const match = /^#\/date\/([^/]+)$/.exec(window.location.hash);
  if (!match) {
    const today = todayIsoDate();
    window.location.hash = `/date/${today}`;
    return today;
  }

  return parseIsoDate(match[1] ?? "");
}

function invalidDateFromHash(): string | null {
  const match = /^#\/date\/([^/]+)$/.exec(window.location.hash);
  if (!match) return null;
  return parseIsoDate(match[1] ?? "") === null ? match[1] ?? "Invalid date" : null;
}

function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case "local-only":
      return "Local only";
    case "saved-locally":
      return "Saved locally";
    case "syncing":
      return "Syncing";
    case "synced":
      return "Synced";
    case "offline":
      return "Offline";
    case "conflict":
      return "Conflict";
    case "error":
      return "Sync error";
  }
}
