import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import { ImageAttachmentFlow, type ReusableImageAttachment } from "~/attachments/imageAttachmentFlow";
import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import { GoogleIdentityTokenProvider, isGooglePopupFailedToOpen } from "~/auth/googleIdentity";
import { ENABLE_FAKE_AUTH, FORCE_FAKE_STORAGE, GOOGLE_CLIENT_ID, LOCAL_DRAFT_DEBOUNCE_MS } from "~/config";
import { MilkdownEditor } from "~/components/MilkdownEditor";
import { SettingsPanel } from "~/components/SettingsPanel";
import { appendImageAttachmentReference, findImageAttachmentReferences } from "~/domain/attachmentReferences";
import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";
import { addDays, dayOfWeek, isToday, parseIsoDate, todayIsoDate, type IsoDate } from "~/domain/dates";
import type { ImageAttachmentResolution } from "~/domain/imageAttachments";
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
import { resolveSyncErrorRetry, type SyncErrorState } from "~/sync/syncErrorRetry";
import {
  GOOGLE_PHOTOS_APPENDONLY_SCOPE,
  GOOGLE_PHOTOS_APP_CREATED_READ_SCOPE,
  GOOGLE_PHOTOS_PICKER_SCOPE,
  GooglePhotosAttachmentProvider,
  preservePickerUri,
  type GooglePhotosPickingSession,
  type PickedGooglePhotosMediaItem
} from "~/photos/googlePhotosAttachments";
import { FakePhotosAttachmentProvider } from "~/photos/fakePhotosAttachments";

const drafts = new IndexedDbLocalDraftStore();
const ACTIVE_IMAGE_PICKER_STORAGE_KEY = "jot.googlePhotosActivePicker";
const ACTIVE_IMAGE_PICKER_TTL_MS = 10 * 60 * 1000;

type StorageRuntime =
  | {
      readonly kind: "fake";
      readonly remote: FakeRemoteStorageProvider;
      readonly imageAttachments: ImageAttachmentFlow | null;
      readonly fakePhotos: FakePhotosAttachmentProvider;
    }
  | {
      readonly kind: "google";
      readonly remote: GoogleDriveStorageProvider;
      readonly tokenProvider: GoogleIdentityTokenProvider;
      readonly imageAttachments: ImageAttachmentFlow | null;
    };

type ImageAttachmentStatus = "idle" | "starting" | "waiting" | "choosing" | "importing";

interface StoredActiveImagePicker {
  readonly date: IsoDate;
  readonly session: GooglePhotosPickingSession;
  readonly createdAtMs: number;
}

export default function Home() {
  const runtime = createStorageRuntime();
  const redirectAuthResult = runtime.kind === "google"
    ? runtime.tokenProvider.consumeRedirectAccessToken()
    : { type: "none" as const };
  let fakeImageInput: HTMLInputElement | undefined;
  const [authenticated, setAuthenticated] = createSignal(
    redirectAuthResult.type === "authenticated" ||
    runtime.kind === "fake" && ENABLE_FAKE_AUTH && globalThis.localStorage?.getItem("jot.fakeAuth") === "true"
  );
  const [authError, setAuthError] = createSignal<string | null>(
    redirectAuthResult.type === "error" ? redirectAuthResult.message : null
  );
  const [redirectAuthErrorActive, setRedirectAuthErrorActive] = createSignal(redirectAuthResult.type === "error");
  const [signingIn, setSigningIn] = createSignal(false);
  const [preparingAuth, setPreparingAuth] = createSignal(runtime.kind === "google");
  const [selectedDate, setSelectedDate] = createSignal<IsoDate | null>(dateFromHash());
  const [invalidDate, setInvalidDate] = createSignal<string | null>(invalidDateFromHash());
  const [markdown, setMarkdown] = createSignal("");
  const [loadedDate, setLoadedDate] = createSignal<IsoDate | null>(null);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("local-only");
  const [lastSyncError, setLastSyncError] = createSignal<SyncErrorState | null>(null);
  const [settings, setSettings] = createSignal<JotSettings>(DEFAULT_JOT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [editorResetKey, setEditorResetKey] = createSignal(0);
  const [focusEditorAtEnd, setFocusEditorAtEnd] = createSignal(false);
  const [imageAttachmentStatus, setImageAttachmentStatus] = createSignal<ImageAttachmentStatus>("idle");
  const [imageAttachmentError, setImageAttachmentError] = createSignal<string | null>(null);
  const [imageAttachmentDate, setImageAttachmentDate] = createSignal<IsoDate | null>(null);
  const [imagePickingSession, setImagePickingSession] = createSignal<GooglePhotosPickingSession | null>(null);
  const [pickedImage, setPickedImage] = createSignal<PickedGooglePhotosMediaItem | null>(null);
  const [reusableImageAttachment, setReusableImageAttachment] = createSignal<ReusableImageAttachment | null>(null);
  const [imageAttachmentAltText, setImageAttachmentAltText] = createSignal("");
  const [importingImageResolutionName, setImportingImageResolutionName] = createSignal<string | null>(null);
  const [imageAttachmentDisplays, setImageAttachmentDisplays] = createSignal<Readonly<Record<string, ImageAttachmentDisplay>>>({});
  const [imageAttachmentRefreshTick, setImageAttachmentRefreshTick] = createSignal(0);
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
  const imageAttachmentResolutionChoices = createMemo(() => {
    const picked = pickedImage();
    if (reusableImageAttachment() !== null || runtime.imageAttachments === null || picked === null) return [];
    return runtime.imageAttachments.getAvailableResolutions(picked);
  });
  const imageAttachmentFlowActive = createMemo(() => imageAttachmentStatus() !== "idle");

  createEffect(() => {
    if (runtime.kind !== "google") {
      setPreparingAuth(false);
      return;
    }

    setPreparingAuth(true);
    void runtime.tokenProvider.initialize()
      .then(() => {
        if (!redirectAuthErrorActive()) setAuthError(null);
      })
      .catch((error: unknown) => {
        if (!redirectAuthErrorActive()) setAuthError(errorMessage(error));
      })
      .finally(() => setPreparingAuth(false));
  });

  createEffect(() => {
    if (!authenticated()) return;

    void loadSettingsOrDefault(runtime.remote).then(setSettings).catch((error: unknown) => {
      const message = errorMessage(error);
      setLoadError(message);
      setLastSyncError({ message, retry: "save-settings" });
      setSyncStatus("error");
    });

    void syncDirtyDailyNoteDrafts(drafts, runtime.remote, untrack(selectedDate)).catch((error: unknown) => {
      setLastSyncError({ message: errorMessage(error), retry: "sync-dirty-drafts" });
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
	        setLastSyncError(null);
	        setImageAttachmentStatus("idle");
	        setImageAttachmentError(null);
	        setImageAttachmentDate(null);
	        setImagePickingSession(null);
	        setPickedImage(null);
	        setReusableImageAttachment(null);
	        setImageAttachmentAltText("");
	        setImportingImageResolutionName(null);
	        setImageAttachmentDisplays({});
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
        void persistLocalDraft(date, value, drafts).then(setSyncStatus).catch((error: unknown) => {
          setLastSyncError({ message: errorMessage(error), retry: "save-current-note", date });
          setSyncStatus("error");
        });
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
      void saveCurrentEditorSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  });

  createEffect(
    on(
      () => [authenticated(), selectedDate(), loadedDate(), markdown(), imageAttachmentRefreshTick()] as const,
      ([isAuthenticated, date, loaded, value]) => {
        if (
          !isAuthenticated ||
          date === null ||
          loaded !== date ||
          runtime.imageAttachments === null
        ) {
          setImageAttachmentDisplays({});
          return;
        }

        const ids = Array.from(new Set(findImageAttachmentReferences(value).map((reference) => reference.id)));
        const current = untrack(imageAttachmentDisplays);
        const next = Object.fromEntries(
          ids.map((id) => [id, current[id] ?? ({ id, status: "loading" } satisfies ImageAttachmentDisplay)])
        );
        setImageAttachmentDisplays(next);

        const now = Date.now();
        const unresolvedIds = ids.filter((id) => shouldResolveImageAttachmentDisplay(current[id], now));
        const nextRefreshAtMs = nextImageAttachmentRefreshAt(Object.values(next), now);
        let refreshTimeout: number | undefined;
        if (nextRefreshAtMs !== undefined) {
          refreshTimeout = window.setTimeout(
            () => setImageAttachmentRefreshTick((tick) => tick + 1),
            Math.max(nextRefreshAtMs - now, 0)
          );
        }
        if (unresolvedIds.length === 0) {
          onCleanup(() => {
            if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
          });
          return;
        }

        let cancelled = false;
        void Promise.all(unresolvedIds.map((id) => runtime.imageAttachments!.resolveImageAttachmentDisplay(id))).then(
          (resolved) => {
            if (cancelled || selectedDate() !== date || loadedDate() !== date) return;
            setImageAttachmentDisplays((displays) => ({
              ...displays,
              ...Object.fromEntries(resolved.map((display) => [display.id, display]))
            }));
          }
        );

        onCleanup(() => {
          cancelled = true;
          if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
        });
      }
    )
  );

  createEffect(
    on(
      () => [authenticated(), selectedDate(), loadedDate()] as const,
      ([isAuthenticated, date, loaded]) => {
        if (
          !isAuthenticated ||
          runtime.kind !== "google" ||
          runtime.imageAttachments === null ||
          date === null ||
          loaded !== date ||
          untrack(imagePickingSession) !== null ||
          untrack(imageAttachmentStatus) !== "idle"
        ) {
          return;
        }

        const stored = loadStoredActiveImagePicker();
        if (stored === null || stored.date !== date) return;

        setImageAttachmentDate(stored.date);
        setImagePickingSession(stored.session);
        setImageAttachmentStatus("waiting");
        setImageAttachmentError(null);
        void waitForPickedImage(stored.session.id, stored.date);
      },
      { defer: false }
    )
  );

  const navigateToDate = async (date: IsoDate) => {
    void saveCurrentEditorSnapshot();
    window.location.hash = `/date/${date}`;
  };

  const loadSelectedDate = async (date: IsoDate) => {
    const session = await loadDailyNoteSession(date, drafts, runtime.remote).catch((error: unknown) => {
      if (shouldApplyLoadedNote(date, selectedDate())) {
        const message = errorMessage(error);
        setLoadError(message);
        setLastSyncError({ message, retry: "load-selected-note", date });
        setSyncStatus("error");
      }
      return null;
    });
    if (session === null || !shouldApplyLoadedNote(date, selectedDate())) return;
    replaceMarkdownFromStorage(session.markdown);
    setLoadedDate(date);
    setSyncStatus(session.status);
    if (session.status !== "conflict") setLastSyncError(null);
  };

  const flushAndSync = async (date: IsoDate, value: string) => {
    await saveAndSyncSnapshot(date, value);
  };

  const saveAndSyncSnapshot = async (date: IsoDate, value: string) => {
    if (shouldApplySyncResult(date, selectedDate())) setSyncStatus("syncing");
    const session = await saveAndSyncDailyNoteSnapshot(date, value, drafts, runtime.remote).catch((error: unknown) => {
      if (shouldApplySyncResult(date, selectedDate())) {
        setLastSyncError({ message: errorMessage(error), retry: "save-current-note", date });
      }
      return null;
    });
    if (session === null) {
      if (shouldApplySyncResult(date, selectedDate())) setSyncStatus("error");
      return;
    }
    if (shouldApplySyncResult(date, selectedDate())) {
      replaceMarkdownFromStorage(session.markdown);
      setSyncStatus(session.status);
      if (session.status !== "conflict") setLastSyncError(null);
    }
  };

  const replaceMarkdownFromStorage = (value: string) => {
    setSuppressLocalPersist(true);
    setMarkdown(value);
    queueMicrotask(() => setSuppressLocalPersist(false));
  };

  const saveCurrentEditorSnapshot = async () => {
    const date = selectedDate();
    if (date === null || !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() })) return;
    await saveAndSyncSnapshot(date, markdown());
  };

  const retryLastSyncError = () => {
    const error = lastSyncError();
    if (error === null) return;
    const action = resolveSyncErrorRetry(error, { selectedDate: selectedDate(), loadedDate: loadedDate() });

    setLastSyncError(null);
    if (action === null) return;

    switch (action.type) {
      case "load-selected-note": {
        setLoadError(null);
        void loadSelectedDate(action.date);
        return;
      }
      case "save-current-note":
        void saveAndSyncSnapshot(action.date, markdown());
        return;
      case "save-settings":
        updateSettings(settings());
        return;
      case "sync-dirty-drafts":
        void syncDirtyDailyNoteDrafts(drafts, runtime.remote, untrack(selectedDate)).catch((syncError: unknown) => {
          setLastSyncError({ message: errorMessage(syncError), retry: "sync-dirty-drafts" });
          setSyncStatus("error");
        });
        return;
    }
  };

  const updateSettings = (next: JotSettings) => {
    const normalized = normalizeJotSettings(next);
    setSettings(normalized);
    void runtime.remote.saveSettings(normalized).then(() => setLastSyncError(null)).catch((error: unknown) => {
      setLastSyncError({ message: errorMessage(error), retry: "save-settings" });
      setSyncStatus("error");
    });
  };

  const startImagePick = async () => {
    if (runtime.imageAttachments === null) return;
    const date = selectedDate();
    if (date === null || !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() })) return;

    setImageAttachmentStatus("starting");
    setImageAttachmentError(null);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);
    setImageAttachmentDate(date);

    if (runtime.kind === "fake") {
      fakeImageInput?.click();
      setImageAttachmentStatus("idle");
      return;
    }

    const pickerWindow = openPickerPlaceholderWindow();

    try {
      const session = await runtime.imageAttachments.startPicking();
      storeActiveImagePicker({ date, session, createdAtMs: Date.now() });
      setImagePickingSession(session);
      setImageAttachmentStatus("waiting");
      navigatePickerWindow(pickerWindow, session.pickerUri);
      void waitForPickedImage(session.id, date);
    } catch (error: unknown) {
      clearStoredActiveImagePicker();
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("idle");
    }
  };

  const waitForPickedImage = async (sessionId: string, date: IsoDate) => {
    if (runtime.kind !== "google" || runtime.imageAttachments === null) return;

    try {
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await delay(2000);
        if (imagePickingSession()?.id !== sessionId || imageAttachmentDate() !== date) return;

        const refreshedSession = preservePickerUri(
          imagePickingSession(),
          await runtime.imageAttachments.getPickingSession(sessionId)
        );
        storeActiveImagePicker({ date, session: refreshedSession, createdAtMs: Date.now() });
        setImagePickingSession(refreshedSession);
        if (!refreshedSession.mediaItemsSet) continue;

        const picked = await runtime.imageAttachments.getFirstPickedImage(sessionId);
        if (picked === null) {
          throw new Error("No image was selected in Google Photos.");
        }

        const reusable = await runtime.imageAttachments.findReusablePickedImage(picked);
        setPickedImage(picked);
        setReusableImageAttachment(reusable);
        setImageAttachmentAltText(defaultImageAltText(picked, reusable));
        setImageAttachmentStatus("choosing");
        return;
      }

      throw new Error("Timed out waiting for a selected Google Photos image.");
    } catch (error: unknown) {
      if (imagePickingSession()?.id !== sessionId || imageAttachmentDate() !== date) return;
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("waiting");
    }
  };

  const insertPickedImage = async (selectedResolution: ImageAttachmentResolution) => {
    const picked = pickedImage();
    const date = imageAttachmentDate();
    if (
      runtime.imageAttachments === null ||
      picked === null ||
      date === null ||
      !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() }) ||
      selectedDate() !== date
    ) return;

    setImageAttachmentStatus("importing");
    setImportingImageResolutionName(selectedResolution.name);
    setImageAttachmentError(null);
    try {
      const inserted = await runtime.imageAttachments.importPickedImage({
        picked,
        selectedResolution,
        altText: imageAttachmentAltText()
      });
      const nextMarkdown = appendImageAttachmentReference(markdown(), inserted.markdownReference);
      setMarkdown(nextMarkdown);
      setFocusEditorAtEnd(true);
      setEditorResetKey((key) => key + 1);
      setImagePickingSession(null);
      clearStoredActiveImagePicker();
      setPickedImage(null);
      setReusableImageAttachment(null);
      setImageAttachmentDate(null);
      setImageAttachmentAltText("");
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("idle");
      await saveAndSyncSnapshot(date, nextMarkdown);
    } catch (error: unknown) {
      setImageAttachmentError(errorMessage(error));
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("choosing");
    }
  };

  const insertReusablePickedImage = async () => {
    const reusable = reusableImageAttachment();
    const date = imageAttachmentDate();
    if (
      runtime.imageAttachments === null ||
      reusable === null ||
      date === null ||
      !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() }) ||
      selectedDate() !== date
    ) return;

    setImageAttachmentStatus("importing");
    setImportingImageResolutionName("reuse");
    setImageAttachmentError(null);
    try {
      const inserted = runtime.imageAttachments.insertReusableImage({
        reusable,
        altText: imageAttachmentAltText()
      });
      const nextMarkdown = appendImageAttachmentReference(markdown(), inserted.markdownReference);
      setMarkdown(nextMarkdown);
      setFocusEditorAtEnd(true);
      setEditorResetKey((key) => key + 1);
      setImagePickingSession(null);
      clearStoredActiveImagePicker();
      setPickedImage(null);
      setReusableImageAttachment(null);
      setImageAttachmentDate(null);
      setImageAttachmentAltText("");
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("idle");
      await saveAndSyncSnapshot(date, nextMarkdown);
    } catch (error: unknown) {
      setImageAttachmentError(errorMessage(error));
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("choosing");
    }
  };

  const cancelImageAttachmentSelection = () => {
    if (imageAttachmentStatus() === "importing") return;

    setImageAttachmentStatus("idle");
    setImageAttachmentError(null);
    setImageAttachmentDate(null);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);
  };

  const handleFakeImageFile = async (file: File | undefined) => {
    if (runtime.kind !== "fake" || runtime.imageAttachments === null || file === undefined) return;
    const date = imageAttachmentDate();
    if (date === null || selectedDate() !== date || !canEditSelectedDate({ selectedDate: date, loadedDate: loadedDate() })) return;

    setImageAttachmentStatus("starting");
    setImageAttachmentError(null);
    try {
      const picked = await runtime.fakePhotos.pickImageFile(file);
      const reusable = await runtime.imageAttachments.findReusablePickedImage(picked);
      setPickedImage(picked);
      setReusableImageAttachment(reusable);
      setImageAttachmentAltText(defaultImageAltText(picked, reusable));
      setImageAttachmentStatus("choosing");
    } catch (error: unknown) {
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("idle");
    }
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
    clearStoredActiveImagePicker();
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
                disabled={signingIn() || preparingAuth()}
                onClick={() => {
                  setSigningIn(true);
                  setRedirectAuthErrorActive(false);
                  clearStoredActiveImagePicker();
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
                {preparingAuth()
                  ? "Preparing sign-in..."
                  : signingIn()
                    ? "Signing in..."
                    : runtime.kind === "google"
                      ? "Sign in with Google"
                      : "Use development storage"}
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

          <Show when={syncStatus() === "conflict"}>
            <aside class="sync-alert sync-alert-conflict" aria-live="polite">
              Conflict markers were inserted. Resolve them in the note and save again.
            </aside>
          </Show>

          <Show when={syncStatus() === "error" && lastSyncError() !== null}>
            <aside class="sync-alert sync-alert-error" aria-live="polite">
              <strong>Last sync error</strong>
              <pre>{lastSyncError()!.message}</pre>
              <button type="button" onClick={retryLastSyncError}>
                Retry
              </button>
            </aside>
          </Show>

          <Show when={settingsOpen()}>
            <SettingsPanel settings={settings()} onChange={updateSettings} />
          </Show>

          <Show
            when={
              runtime.imageAttachments !== null &&
              canEditSelectedDate({ selectedDate: selectedDate(), loadedDate: loadedDate() })
            }
          >
            <section class="image-attachment-panel" aria-live="polite">
              <Show when={runtime.kind === "fake"}>
                <input
                  ref={fakeImageInput}
                  class="hidden-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void handleFakeImageFile(file);
                  }}
                />
              </Show>
              <div class="image-attachment-controls">
                <button
                  type="button"
                  disabled={
                    imageAttachmentFlowActive()
                  }
                  onClick={() => void startImagePick()}
                >
                  {imageAttachmentStatus() === "starting"
                    ? runtime.kind === "fake" ? "Loading image..." : "Opening Google Photos..."
                    : imageAttachmentStatus() === "waiting"
                      ? "Waiting for image..."
                      : imageAttachmentStatus() === "choosing"
                        ? "Image selected"
                        : imageAttachmentStatus() === "importing"
                          ? "Importing image..."
                          : "Insert image"}
                </button>
              </div>
              <Show when={imagePickingSession()}>
                {(session) => (
                  <div class="image-attachment-session">
                    <Show when={session().pickerUri}>
                      {(pickerUri) => (
                        <a href={pickerAutocloseUrl(pickerUri())} target="_blank" rel="noreferrer">
                          Open Google Photos
                        </a>
                      )}
                    </Show>
                    <Show when={imageAttachmentStatus() === "waiting"}>
                      <span>Waiting for image selection...</span>
                    </Show>
                  </div>
                )}
              </Show>
              <Show when={pickedImage()}>
                {(picked) => (
                  <div class="image-attachment-import">
                    <label>
                      Alt text
                      <input
                        type="text"
                        value={imageAttachmentAltText()}
                        onInput={(event) => setImageAttachmentAltText(event.currentTarget.value)}
                      />
                    </label>
                    <Show
                      when={reusableImageAttachment()}
                      fallback={
                        <div class="image-attachment-sizes" aria-label="Image width">
                          {imageAttachmentResolutionChoices().map((resolution) => (
                            <button
                              type="button"
                              disabled={imageAttachmentStatus() === "importing"}
                              onClick={() => void insertPickedImage(resolution)}
                            >
                              {importingImageResolutionName() === resolution.name
                                ? "Importing..."
                                : `${resolution.label}${resolution.name === "original" ? "" : ` (${resolution.maxWidth} px wide)`}`}
                            </button>
                          ))}
                        </div>
                      }
                    >
                      <div class="image-attachment-sizes">
                        <button
                          type="button"
                          disabled={imageAttachmentStatus() === "importing"}
                          onClick={() => void insertReusablePickedImage()}
                        >
                          {importingImageResolutionName() === "reuse" ? "Inserting..." : "Insert existing image"}
                        </button>
                      </div>
                    </Show>
                    <button
                      type="button"
                      disabled={imageAttachmentStatus() === "importing"}
                      onClick={cancelImageAttachmentSelection}
                    >
                      Cancel
                    </button>
                    <span class="image-attachment-source">
                      {picked().mediaFile?.filename ?? "Selected image"}
                    </span>
                  </div>
                )}
              </Show>
              <Show when={imageAttachmentError()}>
                {(message) => <p class="image-attachment-error">{message()}</p>}
              </Show>
            </section>
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
              resetKey={editorResetKey()}
              focusAtEnd={focusEditorAtEnd()}
              onFocusApplied={() => setFocusEditorAtEnd(false)}
              imageAttachmentDisplays={imageAttachmentDisplays()}
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
  if (GOOGLE_CLIENT_ID && !FORCE_FAKE_STORAGE) {
    const scopes = [
      GOOGLE_DRIVE_FILE_SCOPE,
      GOOGLE_PHOTOS_PICKER_SCOPE,
      GOOGLE_PHOTOS_APPENDONLY_SCOPE,
      GOOGLE_PHOTOS_APP_CREATED_READ_SCOPE
    ];
    const tokenProvider = new GoogleIdentityTokenProvider(GOOGLE_CLIENT_ID, scopes);
    const remote = new GoogleDriveStorageProvider(tokenProvider);
    return {
      kind: "google",
      tokenProvider,
      remote,
      imageAttachments: new ImageAttachmentFlow(new GooglePhotosAttachmentProvider(tokenProvider), remote)
    };
  }

  const remote = new FakeRemoteStorageProvider();
  const fakePhotos = new FakePhotosAttachmentProvider();
  return {
    kind: "fake",
    remote,
    imageAttachments: new ImageAttachmentFlow(fakePhotos, remote),
    fakePhotos
  };
}

async function signIn(runtime: StorageRuntime): Promise<void> {
  if (runtime.kind === "google") {
    try {
      await runtime.tokenProvider.getAccessToken({ prompt: "consent" });
    } catch (error: unknown) {
      if (isGooglePopupFailedToOpen(error)) {
        runtime.tokenProvider.redirectForAccessToken({ prompt: "consent" });
        await new Promise<never>(() => undefined);
      }
      throw error;
    }
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

function pickerAutocloseUrl(pickerUri: string): string {
  return pickerUri.endsWith("/autoclose") ? pickerUri : `${pickerUri.replace(/\/$/, "")}/autoclose`;
}

function openPickerPlaceholderWindow(): Window | null {
  try {
    return window.open("", "jot-google-photos-picker");
  } catch {
    return null;
  }
}

function navigatePickerWindow(pickerWindow: Window | null, pickerUri: string | undefined): void {
  if (pickerWindow === null || pickerUri === undefined || pickerWindow.closed) return;

  try {
    pickerWindow.location.replace(pickerAutocloseUrl(pickerUri));
    pickerWindow.opener = null;
  } catch {
    // The explicit Open Google Photos link remains available when popup navigation fails.
  }
}

function storeActiveImagePicker(activePicker: StoredActiveImagePicker): void {
  getSessionStorage()?.setItem(ACTIVE_IMAGE_PICKER_STORAGE_KEY, JSON.stringify(activePicker));
}

function loadStoredActiveImagePicker(): StoredActiveImagePicker | null {
  const value = getSessionStorage()?.getItem(ACTIVE_IMAGE_PICKER_STORAGE_KEY);
  if (value === undefined || value === null) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredActiveImagePicker>;
    const date = typeof parsed.date === "string" ? parseIsoDate(parsed.date) : null;
    if (
      date === null ||
      typeof parsed.createdAtMs !== "number" ||
      Date.now() - parsed.createdAtMs > ACTIVE_IMAGE_PICKER_TTL_MS ||
      !isPickingSession(parsed.session)
    ) {
      clearStoredActiveImagePicker();
      return null;
    }

    return {
      date,
      session: parsed.session,
      createdAtMs: parsed.createdAtMs
    };
  } catch {
    clearStoredActiveImagePicker();
    return null;
  }
}

function clearStoredActiveImagePicker(): void {
  getSessionStorage()?.removeItem(ACTIVE_IMAGE_PICKER_STORAGE_KEY);
}

function isPickingSession(value: unknown): value is GooglePhotosPickingSession {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("pickerUri" in value) || value.pickerUri === undefined || typeof value.pickerUri === "string")
  );
}

function getSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function defaultImageAltText(
  picked: PickedGooglePhotosMediaItem,
  reusable: ReusableImageAttachment | null
): string {
  return reusable?.metadata.source.filename ?? picked.mediaFile?.filename ?? "";
}

function shouldResolveImageAttachmentDisplay(display: ImageAttachmentDisplay | undefined, nowMs: number): boolean {
  return display === undefined || (display.status === "ready" && display.expiresAtMs !== undefined && display.expiresAtMs <= nowMs);
}

function nextImageAttachmentRefreshAt(displays: readonly ImageAttachmentDisplay[], nowMs: number): number | undefined {
  const refreshTimes = displays.flatMap((display) =>
    display.status === "ready" && display.expiresAtMs !== undefined && display.expiresAtMs > nowMs
      ? [display.expiresAtMs]
      : []
  );
  return refreshTimes.length === 0 ? undefined : Math.min(...refreshTimes);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
