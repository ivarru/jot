import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import { GoogleIdentityTokenProvider } from "~/auth/googleIdentity";
import { ENABLE_FAKE_AUTH, GOOGLE_CLIENT_ID, LOCAL_DRAFT_DEBOUNCE_MS } from "~/config";
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
import { GOOGLE_DRIVE_FILE_SCOPE, GoogleDriveStorageProvider } from "~/storage/googleDriveStorage";
import { IndexedDbLocalDraftStore } from "~/storage/localDraftStore";
import type { RemoteStorageProvider, SyncStatus } from "~/storage/types";
import {
  loadDailyNoteSession,
  persistLocalDraft,
  saveAndSyncDailyNoteSnapshot,
  syncDirtyDailyNoteDrafts
} from "~/sync/syncDailyNote";

const drafts = new IndexedDbLocalDraftStore();

type StorageRuntime =
  | {
      readonly kind: "fake";
      readonly remote: RemoteStorageProvider;
    }
  | {
      readonly kind: "google";
      readonly remote: RemoteStorageProvider;
      readonly tokenProvider: AccessTokenProvider;
    };

export default function Home() {
  const runtime = createStorageRuntime();
  const [authenticated, setAuthenticated] = createSignal(
    runtime.kind === "fake" && ENABLE_FAKE_AUTH && globalThis.localStorage?.getItem("jot.fakeAuth") === "true"
  );
  const [authError, setAuthError] = createSignal<string | null>(null);
  const [signingIn, setSigningIn] = createSignal(false);
  const [selectedDate, setSelectedDate] = createSignal<IsoDate | null>(dateFromHash());
  const [invalidDate, setInvalidDate] = createSignal<string | null>(invalidDateFromHash());
  const [markdown, setMarkdown] = createSignal("");
  const [loadedDate, setLoadedDate] = createSignal<IsoDate | null>(null);
  const [loadError, setLoadError] = createSignal<string | null>(null);
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

    void loadSettingsOrDefault(runtime.remote).then(setSettings).catch((error: unknown) => {
      setLoadError(errorMessage(error));
      setSyncStatus("error");
    });

    void syncDirtyDailyNoteDrafts(drafts, runtime.remote, untrack(selectedDate)).catch(() => {
      setSyncStatus("error");
    });
  });

  createEffect(
    on(
      () => [authenticated(), selectedDate()] as const,
      ([isAuthenticated, date]) => {
        if (!isAuthenticated || date === null) return;

        setLoadedDate(null);
        setLoadError(null);
        replaceMarkdownFromStorage("");
        void loadSelectedDate(date);
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
        void saveAndSyncSnapshot(date, value);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  });

  const navigateToDate = async (date: IsoDate) => {
    const current = selectedDate();
    if (current !== null) {
      void saveAndSyncSnapshot(current, markdown());
    }
    window.location.hash = `/date/${date}`;
  };

  const loadSelectedDate = async (date: IsoDate) => {
    const session = await loadDailyNoteSession(date, drafts, runtime.remote).catch((error: unknown) => {
      if (shouldApplyLoadedNote(date, selectedDate())) {
        setLoadError(errorMessage(error));
        setSyncStatus("error");
      }
      return null;
    });
    if (session === null || !shouldApplyLoadedNote(date, selectedDate())) return;
    replaceMarkdownFromStorage(session.markdown);
    setLoadedDate(date);
    setSyncStatus(session.status);
  };

  const flushAndSync = async (date: IsoDate, value: string) => {
    await saveAndSyncSnapshot(date, value);
  };

  const saveAndSyncSnapshot = async (date: IsoDate, value: string) => {
    if (shouldApplySyncResult(date, selectedDate())) setSyncStatus("syncing");
    const session = await saveAndSyncDailyNoteSnapshot(date, value, drafts, runtime.remote).catch(() => null);
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
    void runtime.remote.saveSettings(normalized);
  };

  const signOut = async () => {
    if (syncStatus() === "saved-locally" || syncStatus() === "conflict" || syncStatus() === "error") {
      const confirmed = window.confirm("Signing out will delete unsynced local data on this device.");
      if (!confirmed) return;
    }

    await drafts.clearAll();
    if (runtime.kind === "google") {
      await runtime.tokenProvider.revoke?.();
    }
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
              when={runtime.kind === "google" || ENABLE_FAKE_AUTH}
              fallback={<p class="muted">Set VITE_GOOGLE_CLIENT_ID or enable VITE_ENABLE_FAKE_AUTH for local testing.</p>}
            >
              <button
                type="button"
                disabled={signingIn()}
                onClick={() => {
                  setSigningIn(true);
                  setAuthError(null);
                  void signIn(runtime)
                    .then(() => {
                      if (runtime.kind === "fake") {
                        globalThis.localStorage?.setItem("jot.fakeAuth", "true");
                      }
                      setAuthenticated(true);
                    })
                    .catch((error: unknown) => setAuthError(errorMessage(error)))
                    .finally(() => setSigningIn(false));
                }}
              >
                {signingIn() ? "Signing in..." : runtime.kind === "google" ? "Sign in with Google" : "Use development storage"}
              </button>
              <Show when={authError()}>
                {(message) => <p class="auth-error">{message()}</p>}
              </Show>
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
            fallback={
              <Show when={loadError()} fallback={<div class="editor-loading">Loading note...</div>}>
                {(message) => (
                  <section class="editor-error" aria-live="polite">
                    <h2>Could not load note</h2>
                    <pre>{message()}</pre>
                    <button
                      type="button"
                      onClick={() => {
                        const date = selectedDate();
                        if (date === null) return;
                        setLoadError(null);
                        void loadSelectedDate(date);
                      }}
                    >
                      Retry
                    </button>
                  </section>
                )}
              </Show>
            }
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
                  void saveAndSyncDailyNoteSnapshot(date, value, drafts, runtime.remote).catch(() => undefined);
                }
              }}
              onBlur={(documentKey, value) => {
                const date = parseIsoDate(documentKey);
                if (date === null) return;
                void saveAndSyncSnapshot(date, value);
              }}
            />
          </Show>
        </Show>
      </Show>
    </main>
  );
}

function createStorageRuntime(): StorageRuntime {
  if (GOOGLE_CLIENT_ID) {
    const tokenProvider = new GoogleIdentityTokenProvider(GOOGLE_CLIENT_ID, [GOOGLE_DRIVE_FILE_SCOPE]);
    return {
      kind: "google",
      tokenProvider,
      remote: new GoogleDriveStorageProvider(tokenProvider)
    };
  }

  return {
    kind: "fake",
    remote: new FakeRemoteStorageProvider()
  };
}

async function signIn(runtime: StorageRuntime): Promise<void> {
  if (runtime.kind === "google") {
    await runtime.tokenProvider.getAccessToken({ prompt: "consent" });
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
