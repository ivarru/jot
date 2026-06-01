import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack } from "solid-js";
import { ImageAttachmentFlow, type LocalImageAttachmentSource, type ReusableImageAttachment } from "~/attachments/imageAttachmentFlow";
import { commitImageAttachmentReferenceInsertion } from "~/attachments/imageAttachmentInsertionSession";
import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import { GoogleAccessTokenUnavailableError, GoogleIdentityTokenProvider, isGooglePopupFailedToOpen } from "~/auth/googleIdentity";
import { APP_VERSION, ENABLE_FAKE_AUTH, FORCE_FAKE_STORAGE, GOOGLE_CLIENT_ID, LOCAL_DRAFT_DEBOUNCE_MS } from "~/config";
import { MilkdownEditor } from "~/components/MilkdownEditor";
import { PlainTextEditor } from "~/components/PlainTextEditor";
import { SettingsPanel } from "~/components/SettingsPanel";
import { findImageAttachmentReferences } from "~/domain/attachmentReferences";
import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";
import {
  addDays,
  dayOfWeek,
  millisecondsUntilNextLocalDay,
  parseIsoDate,
  todayIsoDate,
  type IsoDate
} from "~/domain/dates";
import type { ImageAttachmentResolution } from "~/domain/imageAttachments";
import { DEFAULT_JOT_SETTINGS, normalizeJotSettings, type JotSettings } from "~/domain/settings";
import {
  applyEditorChange,
  canApplyEditorAsyncResult,
  canEditDailyNoteDate,
  canEditSelectedDate,
  captureDocumentSnapshot,
  captureVisibleDailyNoteSnapshot,
  resetSelectedDailyNoteSession,
  type DateBoundEditorState,
  type DateBoundEditorTransition,
  type MarkdownWrite,
  type VisibleDailyNoteSnapshot
} from "~/editor/dateBoundEditor";
import {
  EDITOR_MODE_TOGGLE_ARIA_SHORTCUTS,
  EDITOR_MODE_TOGGLE_SHORTCUT_LABEL,
  isEditorModeToggleShortcut,
  nextEditorMode,
  type EditorMode
} from "~/editor/editorModeShortcut";
import { FakeRemoteStorageProvider, loadSettingsOrDefault } from "~/storage/fakeRemoteStorage";
import { GOOGLE_DRIVE_FILE_SCOPE, GoogleDriveRequestError, GoogleDriveStorageProvider } from "~/storage/googleDriveStorage";
import { IndexedDbLocalDraftStore } from "~/storage/localDraftStore";
import type { RemoteStorageProvider, SyncStatus } from "~/storage/types";
import {
  persistLocalDraft,
  saveAndSyncDailyNoteSnapshot,
  syncDirtyDailyNoteDrafts
} from "~/sync/syncDailyNote";
import {
  captureSaveRetrySnapshot,
  loadSelectedDailyNoteSession,
  reconnectSelectedDailyNoteAction,
  refreshCleanSelectedDailyNoteSession,
  saveSelectedDailyNoteSnapshot,
  saveVisibleDailyNoteSnapshot,
  selectedDailyNotePollingAction,
  type LoadSelectedDailyNoteSessionResult,
  type RefreshCleanSelectedDailyNoteSessionResult,
  type SaveSelectedDailyNoteSnapshotResult
} from "~/sync/selectedDailyNoteSession";
import { resolveSyncErrorRetry, type SyncErrorState } from "~/sync/syncErrorRetry";
import {
  nextSyncRetryDelayMs,
  shouldScheduleSyncRetry,
  shouldShowUnsyncedWarning,
  shouldTrackUnsyncedSince
} from "~/sync/syncScheduling";
import {
  GOOGLE_PHOTOS_APPENDONLY_SCOPE,
  GOOGLE_PHOTOS_APP_CREATED_READ_SCOPE,
  GOOGLE_PHOTOS_PICKER_SCOPE,
  GooglePhotosAttachmentProvider,
  GooglePhotosRequestError,
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
type LocalImageSourceKind = LocalImageAttachmentSource["kind"];

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
  let uploadImageInput: HTMLInputElement | undefined;
  let cameraVideo: HTMLVideoElement | undefined;
  let imageAltTextInput: HTMLInputElement | undefined;
  let aboutCloseButton: HTMLButtonElement | undefined;
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
  const [authReconnectRequired, setAuthReconnectRequired] = createSignal(false);
  const [reconnectingAuth, setReconnectingAuth] = createSignal(false);
  const [selectedDate, setSelectedDate] = createSignal<IsoDate | null>(dateFromHash());
  const [invalidDate, setInvalidDate] = createSignal<string | null>(invalidDateFromHash());
  const [markdown, setMarkdown] = createSignal("");
  const [cleanEditorMarkdown, setCleanEditorMarkdown] = createSignal<string | null>(null);
  const [loadedDate, setLoadedDate] = createSignal<IsoDate | null>(null);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("local-only");
  const [lastSyncError, setLastSyncError] = createSignal<SyncErrorState | null>(null);
  const [syncRetryAttempt, setSyncRetryAttempt] = createSignal(0);
  const [unsyncedSinceMs, setUnsyncedSinceMs] = createSignal<number | null>(null);
  const [syncWarningTick, setSyncWarningTick] = createSignal(0);
  const [settings, setSettings] = createSignal<JotSettings>(DEFAULT_JOT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [topMenuOpen, setTopMenuOpen] = createSignal(false);
  const [aboutOpen, setAboutOpen] = createSignal(false);
  const [editorMode, setEditorMode] = createSignal<EditorMode>("wysiwyg");
  const [insertImageMenuOpen, setInsertImageMenuOpen] = createSignal(false);
  const [editorResetKey, setEditorResetKey] = createSignal(0);
  const [focusEditorAtEnd, setFocusEditorAtEnd] = createSignal(false);
  const [focusEditorOffset, setFocusEditorOffset] = createSignal<number | null>(null);
  const [lastEditorCursorOffset, setLastEditorCursorOffset] = createSignal(0);
  const [imageAttachmentStatus, setImageAttachmentStatus] = createSignal<ImageAttachmentStatus>("idle");
  const [imageAttachmentError, setImageAttachmentError] = createSignal<string | null>(null);
  const [imageAttachmentDate, setImageAttachmentDate] = createSignal<IsoDate | null>(null);
  const [imagePickingSession, setImagePickingSession] = createSignal<GooglePhotosPickingSession | null>(null);
  const [pickedImage, setPickedImage] = createSignal<PickedGooglePhotosMediaItem | null>(null);
  const [localImageSource, setLocalImageSource] = createSignal<LocalImageAttachmentSource | null>(null);
  const [cameraStream, setCameraStream] = createSignal<MediaStream | null>(null);
  const [reusableImageAttachment, setReusableImageAttachment] = createSignal<ReusableImageAttachment | null>(null);
  const [imageAttachmentAltText, setImageAttachmentAltText] = createSignal("");
  const [importingImageResolutionName, setImportingImageResolutionName] = createSignal<string | null>(null);
  const [imageAttachmentDisplays, setImageAttachmentDisplays] = createSignal<Readonly<Record<string, ImageAttachmentDisplay>>>({});
  const [imageAttachmentRefreshTick, setImageAttachmentRefreshTick] = createSignal(0);
  const [today, setToday] = createSignal(todayIsoDate());
  const [suppressLocalPersist, setSuppressLocalPersist] = createSignal(false);
  const [editorChangeEpoch, setEditorChangeEpoch] = createSignal(0);

  const dateBoundEditorState = (): DateBoundEditorState => ({
    selectedDate: selectedDate(),
    loadedDate: loadedDate(),
    markdown: markdown(),
    cleanMarkdown: cleanEditorMarkdown(),
    editorChangeEpoch: editorChangeEpoch()
  });

  const weekday = createMemo(() => {
    const date = selectedDate();
    return date ? dayOfWeek(date) : "";
  });
  const selectedIsToday = createMemo(() => {
    const date = selectedDate();
    return date !== null && date === today();
  });
  const selectedDateCanEdit = createMemo(() => canEditSelectedDate(dateBoundEditorState()));
  const imageAttachmentResolutionChoices = createMemo(() => {
    const local = localImageSource();
    if (local !== null && runtime.imageAttachments !== null) {
      return runtime.imageAttachments.getAvailableResolutionsForLocalImage(local);
    }
    const picked = pickedImage();
    if (reusableImageAttachment() !== null || runtime.imageAttachments === null || picked === null) return [];
    return runtime.imageAttachments.getAvailableResolutions(picked);
  });
  const imageAttachmentFlowActive = createMemo(() => imageAttachmentStatus() !== "idle");
  const syncDelayed = createMemo(() => {
    syncWarningTick();
    return shouldShowUnsyncedWarning(syncStatus(), unsyncedSinceMs(), Date.now());
  });

  const clearCameraStream = () => {
    const stream = cameraStream();
    if (stream !== null) {
      stopCameraStream(stream);
    }
    setCameraStream(null);
  };

  const replaceMarkdownFromStorage = (value: string) => {
    setSuppressLocalPersist(true);
    setMarkdown(value);
    queueMicrotask(() => setSuppressLocalPersist(false));
  };

  const applyDateBoundEditorTransition = (transition: DateBoundEditorTransition) => {
    setLoadedDate(transition.state.loadedDate);
    setCleanEditorMarkdown(transition.state.cleanMarkdown);
    setEditorChangeEpoch(transition.state.editorChangeEpoch);
    applyMarkdownWrite(transition.markdownWrite);
  };

  const applyMarkdownWrite = (write: MarkdownWrite | undefined) => {
    if (write === undefined) return;
    if (write.source === "storage") {
      replaceMarkdownFromStorage(write.markdown);
    } else {
      setMarkdown(write.markdown);
    }
  };

  let todayRefreshTimeout: number | undefined;

  const refreshAndScheduleToday = () => {
    if (todayRefreshTimeout !== undefined) {
      window.clearTimeout(todayRefreshTimeout);
    }
    setToday(todayIsoDate());
    todayRefreshTimeout = window.setTimeout(() => {
      todayRefreshTimeout = undefined;
      refreshAndScheduleToday();
    }, millisecondsUntilNextLocalDay());
  };

  const handleRemoteError = (error: unknown, retry: SyncErrorState | null = null): boolean => {
    if (!isAuthReconnectError(error)) return false;

    if (runtime.kind === "google") {
      runtime.tokenProvider.invalidateAccessToken?.();
    }
    setAuthReconnectRequired(true);
    setSyncStatus("auth-required");
    setLastSyncError(null);
    if (retry?.retry === "load-selected-note") {
      setLoadError(null);
    }
    return true;
  };

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
      if (handleRemoteError(error, { message: errorMessage(error), retry: "save-settings" })) return;
      const message = errorMessage(error);
      setLoadError(message);
      setLastSyncError({ message, retry: "save-settings" });
      setSyncStatus("error");
    });

    void syncDirtyDailyNoteDrafts(drafts, runtime.remote, untrack(selectedDate)).catch((error: unknown) => {
      if (handleRemoteError(error, { message: errorMessage(error), retry: "sync-dirty-drafts" })) return;
      setLastSyncError({ message: errorMessage(error), retry: "sync-dirty-drafts" });
      setSyncStatus("error");
    });
  });

  createEffect(
    on(
      () => [authenticated(), selectedDate()] as const,
      ([isAuthenticated, date]) => {
        if (!isAuthenticated || date === null) return;

	        applyDateBoundEditorTransition(resetSelectedDailyNoteSession(dateBoundEditorState(), date));
	        setLoadError(null);
	        setLastSyncError(null);
	        setImageAttachmentStatus("idle");
	        setImageAttachmentError(null);
	        setImageAttachmentDate(null);
	        setImagePickingSession(null);
	        setPickedImage(null);
	        setLocalImageSource(null);
	        clearCameraStream();
	        setReusableImageAttachment(null);
	        setImageAttachmentAltText("");
	        setImportingImageResolutionName(null);
	        setImageAttachmentDisplays({});
	        void loadSelectedDate(date);
      },
      { defer: false }
    )
  );

  createEffect(
    on(markdown, (value) => {
      const snapshot = captureVisibleDailyNoteSnapshot({ ...dateBoundEditorState(), markdown: value });
      if (!authenticated() || snapshot === null || suppressLocalPersist()) return;

      const timeout = window.setTimeout(() => {
        void persistLocalDraft(snapshot.date, snapshot.markdown, drafts).then(setSyncStatus).catch((error: unknown) => {
          setLastSyncError({ message: errorMessage(error), retry: "save-current-note", date: snapshot.date });
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
        const snapshot = captureVisibleDailyNoteSnapshot({ ...dateBoundEditorState(), markdown: value });
        if (!authenticated() || snapshot === null) return;
        if (authReconnectRequired()) return;

        const timeout = window.setTimeout(() => {
          void flushAndSync(snapshot);
        }, settings().autosaveDebounceMs);

        onCleanup(() => window.clearTimeout(timeout));
      }
    )
  );

  createEffect(
    on(syncStatus, (status) => {
      if (!shouldTrackUnsyncedSince(status)) {
        setUnsyncedSinceMs(null);
        return;
      }

      if (unsyncedSinceMs() === null) {
        setUnsyncedSinceMs(Date.now());
      }
    })
  );

  createEffect(
    on(
      () =>
        [
          lastSyncError(),
          syncRetryAttempt(),
          authenticated(),
          authReconnectRequired(),
          syncStatus(),
          settings().retryInitialDelayMs,
          settings().retryMaxDelayMs
        ] as const,
      ([error, attempt, isAuthenticated, reconnectRequired, status]) => {
        if (
          !shouldScheduleSyncRetry({
            hasSyncError: error !== null,
            authenticated: isAuthenticated,
            authReconnectRequired: reconnectRequired,
            syncStatus: status
          })
        ) return;

        const timeout = window.setTimeout(() => {
          setSyncRetryAttempt((current) => current + 1);
          retryLastSyncError();
        }, nextSyncRetryDelayMs(attempt, settings()));

        onCleanup(() => window.clearTimeout(timeout));
      }
    )
  );

  createEffect(
    on(
      () => [lastSyncError(), syncStatus()] as const,
      ([error, status]) => {
        if (error === null && status !== "error" && status !== "syncing") {
          setSyncRetryAttempt(0);
        }
      }
    )
  );

  createEffect(() => {
    refreshAndScheduleToday();
    onCleanup(() => {
      if (todayRefreshTimeout !== undefined) {
        window.clearTimeout(todayRefreshTimeout);
        todayRefreshTimeout = undefined;
      }
    });
  });

  createEffect(
    on(
      () =>
        [
          authenticated(),
          selectedDate(),
          loadedDate(),
          syncStatus(),
          settings().cleanPollingIntervalMs,
          settings().dirtyPollingIntervalMs
        ] as const,
      ([isAuthenticated, _date, _loaded, status]) => {
        const action = selectedDailyNotePollingAction({
          authenticated: isAuthenticated,
          authReconnectRequired: authReconnectRequired(),
          state: dateBoundEditorState(),
          status
        });
        if (action === null) return;

        if (action.type === "clean-refresh") {
          const interval = window.setInterval(() => {
            void refreshCleanSelectedDate(action.date);
          }, settings().cleanPollingIntervalMs);
          onCleanup(() => window.clearInterval(interval));
          return;
        }

        const interval = window.setInterval(() => {
          const nextAction = selectedDailyNotePollingAction({
            authenticated: authenticated(),
            authReconnectRequired: authReconnectRequired(),
            state: dateBoundEditorState(),
            status: syncStatus()
          });
          if (nextAction?.type === "dirty-save") void saveAndSyncSnapshot(nextAction.snapshot);
        }, settings().dirtyPollingIntervalMs);
        onCleanup(() => window.clearInterval(interval));
      }
    )
  );

  createEffect(() => {
    const interval = window.setInterval(() => setSyncWarningTick((tick) => tick + 1), 10000);
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
      clearCameraStream();
      void saveCurrentEditorSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  });

  createEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEditorModeToggleShortcut(event)) return;
      if (!authenticated() || !canEditSelectedDate(dateBoundEditorState())) return;

      event.preventDefault();
      updateEditorMode(nextEditorMode(editorMode()));
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  createEffect(() => {
    const stream = cameraStream();
    if (cameraVideo === undefined) return;
    cameraVideo.srcObject = stream;
    if (stream !== null) {
      void cameraVideo.play().catch((error: unknown) => setImageAttachmentError(errorMessage(error)));
    }
  });

  createEffect(() => {
    if ((pickedImage() === null && localImageSource() === null) || imageAttachmentStatus() !== "choosing") return;
    window.requestAnimationFrame(() => imageAltTextInput?.focus());
  });

  createEffect(() => {
    if (!aboutOpen()) return;
    window.requestAnimationFrame(() => aboutCloseButton?.focus());
  });

  onCleanup(() => clearCameraStream());

  createEffect(
    on(
      () => [authenticated(), selectedDate(), loadedDate(), markdown(), imageAttachmentRefreshTick()] as const,
      ([isAuthenticated, date, loaded, value]) => {
        if (
          !isAuthenticated ||
          authReconnectRequired() ||
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
            if (cancelled || !canApplyEditorAsyncResult(dateBoundEditorState(), date)) return;
            setImageAttachmentDisplays((displays) => ({
              ...displays,
              ...Object.fromEntries(resolved.map((display) => [display.id, display]))
            }));
          },
          (error: unknown) => {
            if (cancelled || !canApplyEditorAsyncResult(dateBoundEditorState(), date)) return;
            handleRemoteError(error);
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
          authReconnectRequired() ||
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
    const result = await loadSelectedDailyNoteSession({
      date,
      drafts,
      remote: runtime.remote,
      getState: dateBoundEditorState
    });
    applySelectedDailyNoteLoadResult(result);
  };

  const refreshCleanSelectedDate = async (date: IsoDate) => {
    const result = await refreshCleanSelectedDailyNoteSession({
      date,
      drafts,
      remote: runtime.remote,
      getState: dateBoundEditorState
    });
    applySelectedDailyNoteRefreshResult(result);
  };

  const applySelectedDailyNoteLoadResult = (result: LoadSelectedDailyNoteSessionResult) => {
    switch (result.type) {
      case "loaded":
        if (result.transition === null) return;
        applyDateBoundEditorTransition(result.transition);
        setSyncStatus(result.session.status);
        if (result.session.status !== "conflict") setLastSyncError(null);
        return;
      case "failed":
        if (!result.applyToSelectedDate) return;
        if (handleRemoteError(result.error, {
          message: errorMessage(result.error),
          retry: "load-selected-note",
          date: result.date
        })) return;
        {
          const message = errorMessage(result.error);
          setLoadError(message);
          setLastSyncError({ message, retry: "load-selected-note", date: result.date });
          setSyncStatus("error");
        }
        return;
    }
  };

  const applySelectedDailyNoteRefreshResult = (result: RefreshCleanSelectedDailyNoteSessionResult) => {
    switch (result.type) {
      case "skipped":
        return;
      case "refreshed":
        applyDateBoundEditorTransition(result.transition);
        setSyncStatus(result.session.status);
        if (result.session.status !== "conflict") setLastSyncError(null);
        return;
      case "failed":
        if (!result.applyToSelectedDate) return;
        if (result.phase === "load" && handleRemoteError(result.error, {
          message: errorMessage(result.error),
          retry: "load-selected-note",
          date: result.date
        })) return;
        setLastSyncError({ message: errorMessage(result.error), retry: "load-selected-note", date: result.date });
        setSyncStatus("error");
        return;
    }
  };

  const flushAndSync = async (snapshot: VisibleDailyNoteSnapshot) => {
    await saveAndSyncSnapshot(snapshot);
  };

  const saveAndSyncSnapshot = async (snapshot: VisibleDailyNoteSnapshot) => {
    if (!authReconnectRequired() && canEditDailyNoteDate(snapshot.date, dateBoundEditorState())) setSyncStatus("syncing");
    const result = await saveSelectedDailyNoteSnapshot({
      snapshot,
      authReconnectRequired: authReconnectRequired(),
      drafts,
      remote: runtime.remote,
      getState: dateBoundEditorState
    });
    applySelectedDailyNoteSaveResult(result);
  };

  const applySelectedDailyNoteSaveResult = (result: SaveSelectedDailyNoteSnapshotResult) => {
    switch (result.type) {
      case "auth-required":
        if (result.applyStatus !== null) setSyncStatus(result.applyStatus);
        return;
      case "saved":
        if (result.transition === null) return;
        applyDateBoundEditorTransition(result.transition);
        setSyncStatus(result.session.status);
        if (result.session.status !== "conflict") setLastSyncError(null);
        return;
      case "failed":
        if (!result.applyToVisibleDailyNote) return;
        if (handleRemoteError(result.error, {
          message: errorMessage(result.error),
          retry: "save-current-note",
          date: result.snapshot.date
        })) return;
        setLastSyncError({ message: errorMessage(result.error), retry: "save-current-note", date: result.snapshot.date });
        setSyncStatus("error");
        return;
    }
  };

  const saveCurrentEditorSnapshot = async () => {
    const result = await saveVisibleDailyNoteSnapshot({
      authReconnectRequired: authReconnectRequired(),
      drafts,
      remote: runtime.remote,
      getState: dateBoundEditorState
    });
    if (result !== null) applySelectedDailyNoteSaveResult(result);
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
        {
          const snapshot = captureSaveRetrySnapshot(dateBoundEditorState(), action);
          if (snapshot !== null) void saveAndSyncSnapshot(snapshot);
        }
        return;
      case "save-settings":
        updateSettings(settings());
        return;
      case "sync-dirty-drafts":
        void syncDirtyDailyNoteDrafts(drafts, runtime.remote, untrack(selectedDate)).catch((syncError: unknown) => {
          if (handleRemoteError(syncError, { message: errorMessage(syncError), retry: "sync-dirty-drafts" })) return;
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
      if (handleRemoteError(error, { message: errorMessage(error), retry: "save-settings" })) return;
      setLastSyncError({ message: errorMessage(error), retry: "save-settings" });
      setSyncStatus("error");
    });
  };

  const updateEditorMode = (mode: EditorMode) => {
    if (editorMode() === mode) return;
    setFocusEditorOffset(lastEditorCursorOffset());
    setEditorMode(mode);
  };

  const handleEditorChange = (documentKey: string, value: string) => {
    const date = parseIsoDate(documentKey);
    if (date === null) return;
    const result = applyEditorChange(dateBoundEditorState(), date, value);
    if (result.type === "current-editor") {
      applyDateBoundEditorTransition({ state: result.state, markdownWrite: result.markdownWrite });
      return;
    }

    void saveAndSyncDailyNoteSnapshot(result.backgroundSave.date, result.backgroundSave.markdown, drafts, runtime.remote).catch((error: unknown) => {
      if (handleRemoteError(error, { message: errorMessage(error), retry: "save-current-note", date: result.backgroundSave.date })) return;
    });
  };

  const handleEditorBlur = (documentKey: string, value: string) => {
    const date = parseIsoDate(documentKey);
    if (date === null) return;
    void saveAndSyncSnapshot(captureDocumentSnapshot(date, value));
  };

  const startGooglePhotosImagePick = async () => {
    if (runtime.imageAttachments === null) return;
    const date = selectedDate();
    if (!canEditDailyNoteDate(date, dateBoundEditorState())) return;

    setImageAttachmentStatus("starting");
    setInsertImageMenuOpen(false);
    setImageAttachmentError(null);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setLocalImageSource(null);
    clearCameraStream();
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);
    setImageAttachmentDate(date);
    if (runtime.kind !== "google") return;

    const pickerWindow = openPickerPlaceholderWindow();

    try {
      const session = await runtime.imageAttachments.startPicking();
      storeActiveImagePicker({ date, session, createdAtMs: Date.now() });
      setImagePickingSession(session);
      setImageAttachmentStatus("waiting");
      navigatePickerWindow(pickerWindow, session.pickerUri);
      void waitForPickedImage(session.id, date);
    } catch (error: unknown) {
      if (handleRemoteError(error)) {
        setImageAttachmentStatus("idle");
        return;
      }
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
        setLocalImageSource(null);
        setReusableImageAttachment(reusable);
        setImageAttachmentAltText(defaultImageAltText(picked, reusable));
        setImageAttachmentStatus("choosing");
        return;
      }

      throw new Error("Timed out waiting for a selected Google Photos image.");
    } catch (error: unknown) {
      if (imagePickingSession()?.id !== sessionId || imageAttachmentDate() !== date) return;
      if (handleRemoteError(error)) {
        setImageAttachmentStatus("idle");
        return;
      }
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("waiting");
    }
  };

  const insertSelectedImage = async (selectedResolution: ImageAttachmentResolution) => {
    const picked = pickedImage();
    const local = localImageSource();
    const date = imageAttachmentDate();
    if (
      runtime.imageAttachments === null ||
      (picked === null && local === null) ||
      !canEditDailyNoteDate(date, dateBoundEditorState())
    ) return;

    setImageAttachmentStatus("importing");
    setImportingImageResolutionName(selectedResolution.name);
    setImageAttachmentError(null);
    try {
      const inserted = local !== null
        ? await runtime.imageAttachments.importLocalImage({
            source: local,
            selectedResolution,
            altText: imageAttachmentAltText()
          })
	    : await runtime.imageAttachments.importPickedImage({
	            picked: picked!,
	            selectedResolution,
	            altText: imageAttachmentAltText()
	          });
      if (!canApplyEditorAsyncResult(dateBoundEditorState(), date)) return;
      const insertion = commitImageAttachmentReferenceInsertion({
        editorState: dateBoundEditorState(),
        date,
        markdownReference: inserted.markdownReference
      });
      if (insertion === null) return;
      applyDateBoundEditorTransition(insertion.transition);
      setFocusEditorAtEnd(true);
      setFocusEditorOffset(null);
      setEditorResetKey((key) => key + 1);
      setImagePickingSession(null);
      clearStoredActiveImagePicker();
      setPickedImage(null);
      setLocalImageSource(null);
      clearCameraStream();
      setReusableImageAttachment(null);
      setImageAttachmentDate(null);
      setImageAttachmentAltText("");
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("idle");
      await saveAndSyncSnapshot(insertion.saveSnapshot);
    } catch (error: unknown) {
      if (selectedDate() !== date || imageAttachmentDate() !== date) return;
      if (handleRemoteError(error)) {
        setImageAttachmentStatus("choosing");
        setImportingImageResolutionName(null);
        return;
      }
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
      !canEditDailyNoteDate(date, dateBoundEditorState())
    ) return;

    setImageAttachmentStatus("importing");
    setImportingImageResolutionName("reuse");
    setImageAttachmentError(null);
    try {
      const inserted = runtime.imageAttachments.insertReusableImage({
        reusable,
        altText: imageAttachmentAltText()
      });
      const insertion = commitImageAttachmentReferenceInsertion({
        editorState: dateBoundEditorState(),
        date,
        markdownReference: inserted.markdownReference
      });
      if (insertion === null) return;
      applyDateBoundEditorTransition(insertion.transition);
      setFocusEditorAtEnd(true);
      setFocusEditorOffset(null);
      setEditorResetKey((key) => key + 1);
      setImagePickingSession(null);
      clearStoredActiveImagePicker();
      setPickedImage(null);
      setLocalImageSource(null);
      clearCameraStream();
      setReusableImageAttachment(null);
      setImageAttachmentDate(null);
      setImageAttachmentAltText("");
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("idle");
      await saveAndSyncSnapshot(insertion.saveSnapshot);
    } catch (error: unknown) {
      if (handleRemoteError(error)) {
        setImageAttachmentStatus("choosing");
        setImportingImageResolutionName(null);
        return;
      }
      setImageAttachmentError(errorMessage(error));
      setImportingImageResolutionName(null);
      setImageAttachmentStatus("choosing");
    }
  };

  const cancelImageAttachmentSelection = () => {
    if (imageAttachmentStatus() === "importing") return;

    setImageAttachmentStatus("idle");
    setInsertImageMenuOpen(false);
    setImageAttachmentError(null);
    setImageAttachmentDate(null);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setLocalImageSource(null);
    clearCameraStream();
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);
  };

  const handleLocalImageFile = async (file: File | undefined, kind: LocalImageSourceKind) => {
    if (runtime.imageAttachments === null || file === undefined) return;
    const date = imageAttachmentDate();
    if (!canEditDailyNoteDate(date, dateBoundEditorState())) return;

    setImageAttachmentStatus("idle");
    setInsertImageMenuOpen(false);
    setImageAttachmentError(null);
    try {
      const source = await runtime.imageAttachments.prepareLocalImageSource({
        kind,
        bytes: file,
        filename: file.name || "image",
        lastModified: file.lastModified
      });
      if (!canApplyEditorAsyncResult(dateBoundEditorState(), date)) return;
      setPickedImage(null);
      setLocalImageSource(source);
      setReusableImageAttachment(null);
      setImageAttachmentAltText(defaultLocalImageAltText(source));
      setImageAttachmentStatus("choosing");
    } catch (error: unknown) {
      if (handleRemoteError(error)) {
        setImageAttachmentStatus("idle");
        return;
      }
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("idle");
    }
  };

  const startLocalImageFilePick = () => {
    if (runtime.imageAttachments === null) return;
    const date = selectedDate();
    if (!canEditDailyNoteDate(date, dateBoundEditorState())) return;

    setImageAttachmentStatus("idle");
    setInsertImageMenuOpen(false);
    setImageAttachmentError(null);
    setImageAttachmentDate(date);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setLocalImageSource(null);
    clearCameraStream();
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);
    uploadImageInput?.click();
  };

  const startCameraCapture = async () => {
    if (runtime.imageAttachments === null) return;
    const date = selectedDate();
    if (!canEditDailyNoteDate(date, dateBoundEditorState())) return;

    setImageAttachmentStatus("starting");
    setInsertImageMenuOpen(false);
    setImageAttachmentError(null);
    setImageAttachmentDate(date);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setLocalImageSource(null);
    clearCameraStream();
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);

    try {
      if (navigator.mediaDevices?.getUserMedia === undefined) {
        throw new Error("Camera capture is not supported by this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" }
        }
      });
      if (!canApplyEditorAsyncResult(dateBoundEditorState(), date)) {
        stopCameraStream(stream);
        return;
      }
      setCameraStream(stream);
      setImageAttachmentStatus("waiting");
    } catch (error: unknown) {
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("idle");
    }
  };

  const captureCameraImage = async () => {
    const date = imageAttachmentDate();
    if (runtime.imageAttachments === null || cameraVideo === undefined) return;
    if (!canEditDailyNoteDate(date, dateBoundEditorState())) return;

    try {
      const blob = await captureVideoFrame(cameraVideo);
      clearCameraStream();
      const source = await runtime.imageAttachments.prepareLocalImageSource({
        kind: "device-camera",
        bytes: blob,
        filename: `camera-${date}-${Date.now()}.jpg`,
        lastModified: Date.now()
      });
      if (!canApplyEditorAsyncResult(dateBoundEditorState(), date)) return;
      setPickedImage(null);
      setLocalImageSource(source);
      setReusableImageAttachment(null);
      setImageAttachmentAltText(defaultLocalImageAltText(source));
      setImageAttachmentStatus("choosing");
    } catch (error: unknown) {
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("waiting");
    }
  };

  const handleEditorImagePaste = (documentKey: string, file: File) => {
    const date = parseIsoDate(documentKey);
    if (date === null || imageAttachmentStatus() === "importing") return;
    void preparePastedImageForDate(file, date);
  };

  const preparePastedImageForDate = async (file: File, date: IsoDate) => {
    if (runtime.imageAttachments === null) return;
    if (!canEditDailyNoteDate(date, dateBoundEditorState())) {
      setImageAttachmentStatus("idle");
      return;
    }

    setImageAttachmentStatus("starting");
    setInsertImageMenuOpen(false);
    setImageAttachmentError(null);
    setImageAttachmentDate(date);
    setImagePickingSession(null);
    clearStoredActiveImagePicker();
    setPickedImage(null);
    setLocalImageSource(null);
    clearCameraStream();
    setReusableImageAttachment(null);
    setImageAttachmentAltText("");
    setImportingImageResolutionName(null);

    try {
      const source = await runtime.imageAttachments.prepareLocalImageSource({
        kind: "clipboard",
        bytes: file,
        filename: file.name || `clipboard-image${extensionForMimeType(file.type)}`,
        lastModified: file.lastModified
      });
      if (
        imageAttachmentDate() !== date ||
        !canApplyEditorAsyncResult(dateBoundEditorState(), date)
      ) return;
      setLocalImageSource(source);
      setImageAttachmentAltText(defaultLocalImageAltText(source));
      setImageAttachmentStatus("choosing");
    } catch (error: unknown) {
      setImageAttachmentError(errorMessage(error));
      setImageAttachmentStatus("idle");
    }
  };

  const reconnectGoogle = async () => {
    if (runtime.kind !== "google" || reconnectingAuth()) return;

    setReconnectingAuth(true);
    setAuthError(null);
    setLastSyncError(null);
    try {
      await signIn(runtime);
      setAuthenticated(true);
      setAuthReconnectRequired(false);
      refreshAndScheduleToday();
      const reconnectAction = reconnectSelectedDailyNoteAction(dateBoundEditorState());
      if (reconnectAction?.type === "save-visible") {
        await saveAndSyncSnapshot(reconnectAction.snapshot);
      } else if (reconnectAction?.type === "load-selected") {
        await loadSelectedDate(reconnectAction.date);
        const loadedAction = reconnectSelectedDailyNoteAction(dateBoundEditorState());
        if (loadedAction?.type === "save-visible") await saveAndSyncSnapshot(loadedAction.snapshot);
      }
      await syncDirtyDailyNoteDrafts(drafts, runtime.remote, untrack(selectedDate));
      const date = selectedDate();
      if (date !== null && canEditDailyNoteDate(date, dateBoundEditorState()) && syncStatus() === "auth-required") {
        setSyncStatus("synced");
      }
    } catch (error: unknown) {
      if (!isGooglePopupFailedToOpen(error)) {
        setAuthError(errorMessage(error));
      }
    } finally {
      setReconnectingAuth(false);
    }
  };

  const signOut = async () => {
    if (syncStatus() === "saved-locally" || syncStatus() === "conflict" || syncStatus() === "error" || syncStatus() === "auth-required") {
      const confirmed = window.confirm("Signing out will delete unsynced local data on this device.");
      if (!confirmed) return;
    }

    await drafts.clearAll();
    if (runtime.kind === "google") {
      await runtime.tokenProvider.revoke?.();
    }
    clearStoredActiveImagePicker();
    globalThis.localStorage?.removeItem("jot.fakeAuth");
    setAuthReconnectRequired(false);
    setAuthenticated(false);
    setCleanEditorMarkdown(null);
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
                      setAuthReconnectRequired(false);
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
              <button type="button" onClick={() => void navigateToDate(today())}>
                Jump to today
              </button>
            </section>
          }
        >
          <header class="app-toolbar">
            <div class="toolbar-column toolbar-date-column">
              <div class="date-selector-row">
                <button type="button" aria-label="Previous day" onClick={() => void navigateToDate(addDays(selectedDate()!, -1))}>
                  ‹
                </button>
                <input
                  class="iso-date-input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                  value={selectedDate() ?? ""}
                  onChange={(event) => {
                    const date = parseIsoDate(event.currentTarget.value);
                    if (date !== null) {
                      void navigateToDate(date);
                    } else {
                      event.currentTarget.value = selectedDate() ?? "";
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const date = parseIsoDate(event.currentTarget.value);
                    if (date !== null) void navigateToDate(date);
                  }}
                  aria-label="Selected date"
                />
                <button type="button" aria-label="Next day" onClick={() => void navigateToDate(addDays(selectedDate()!, 1))}>
                  ›
                </button>
              </div>
              <div class="date-context-row">
                <span class="weekday-label">{weekday()}</span>
                <button
                  type="button"
                  class={`today-jump-button ${selectedIsToday() ? "is-today" : ""}`}
                  onClick={() => {
                    if (!selectedIsToday()) void navigateToDate(today());
                  }}
                  aria-label={selectedIsToday() ? "Selected date is today" : `Jump to today, ${today()}`}
                >
                  {selectedIsToday() ? "Today" : "Not today"}
                </button>
              </div>
            </div>
            <div class="toolbar-column toolbar-editor-column">
              <Show when={runtime.imageAttachments !== null}>
                <input
                  ref={uploadImageInput}
                  class="hidden-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void handleLocalImageFile(file, "device-upload");
                  }}
                />
                <div class="image-attachment-controls">
                  <div class="image-insert-menu">
                    <button
                      type="button"
                      class="icon-button icon-menu-button"
                      aria-label="Insert image"
                      aria-haspopup="menu"
                      aria-expanded={insertImageMenuOpen()}
                      disabled={!selectedDateCanEdit() || imageAttachmentFlowActive()}
                      onClick={() => setInsertImageMenuOpen((open) => !open)}
                    >
                      <InsertImageIcon />
                      <span class="dropdown-caret" aria-hidden="true" />
                    </button>
                    <Show when={insertImageMenuOpen()}>
                      <div class="image-insert-menu-popover" role="menu" aria-label="Insert image source">
                        <Show when={runtime.kind === "google"}>
                          <button type="button" role="menuitem" onClick={() => void startGooglePhotosImagePick()}>
                            Google Photos
                          </button>
                        </Show>
                        <button type="button" role="menuitem" onClick={startLocalImageFilePick}>
                          Upload from device
                        </button>
                        <button type="button" role="menuitem" onClick={() => void startCameraCapture()}>
                          Use camera
                        </button>
                        <div class="image-insert-menu-hint" role="presentation">.. or just paste</div>
                      </div>
                    </Show>
                  </div>
                  <Show when={imageAttachmentStatus() !== "idle"}>
                    <span class="image-attachment-source">
                      {cameraStream() !== null
                        ? "Camera ready"
                        : imageAttachmentStatusLabel(imageAttachmentStatus())}
                    </span>
                  </Show>
                </div>
              </Show>
              <label
                class="raw-mode-toggle"
                data-tooltip={`Toggle raw Markdown (${EDITOR_MODE_TOGGLE_SHORTCUT_LABEL})`}
                title={`Toggle raw Markdown (${EDITOR_MODE_TOGGLE_SHORTCUT_LABEL})`}
              >
                <input
                  type="checkbox"
                  checked={editorMode() === "text"}
                  aria-keyshortcuts={EDITOR_MODE_TOGGLE_ARIA_SHORTCUTS}
                  onChange={(event) => updateEditorMode(event.currentTarget.checked ? "text" : "wysiwyg")}
                />
                <span>Raw</span>
              </label>
              <Show when={authReconnectRequired()}>
                <button
                  type="button"
                  class="toolbar-reconnect-button"
                  disabled={reconnectingAuth()}
                  onClick={() => void reconnectGoogle()}
                >
                  {reconnectingAuth() ? "Reconnecting..." : "Reconnect"}
                </button>
              </Show>
            </div>
            <div class="toolbar-column toolbar-status-column">
              <span class={`sync-status sync-${syncStatus()}`}>{syncStatusLabel(syncStatus())}</span>
              <Show when={syncDelayed()}>
                <span
                  class="sync-delay-warning"
                  role="status"
                  aria-live="polite"
                  aria-label="Sync delayed"
                  title="Sync delayed"
                >
                  <SyncDelayedIcon />
                </span>
              </Show>
              <div class="top-menu">
                <button
                  type="button"
                  class="icon-button"
                  aria-label="Open menu"
                  aria-haspopup="menu"
                  aria-expanded={topMenuOpen()}
                  onClick={() => setTopMenuOpen((open) => !open)}
                >
                  <MenuIcon />
                </button>
                <Show when={topMenuOpen()}>
                  <div class="top-menu-popover" role="menu" aria-label="Application menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTopMenuOpen(false);
                        setAboutOpen(true);
                      }}
                    >
                      About Jot
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTopMenuOpen(false);
                        setSettingsOpen((open) => !open);
                      }}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTopMenuOpen(false);
                        void signOut();
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </Show>
              </div>
            </div>
          </header>

          <Show when={syncStatus() === "conflict"}>
            <aside class="sync-alert sync-alert-conflict" aria-live="polite">
              Conflict markers were inserted. Resolve them in the note and save again.
            </aside>
          </Show>

          <Show when={authReconnectRequired()}>
            <aside class="sync-alert sync-alert-auth" aria-live="polite">
              <strong>Reconnect to sync</strong>
              <p>Jot is keeping edits on this device until Google access is refreshed.</p>
              <Show when={authError()}>
                {(message) => <p class="auth-error">{message()}</p>}
              </Show>
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

          <Show when={aboutOpen()}>
            <div class="modal-backdrop" role="presentation" onClick={() => setAboutOpen(false)}>
              <div
                class="about-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="about-modal-title"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setAboutOpen(false);
                }}
              >
                <div class="about-modal-header">
                  <h2 id="about-modal-title">About Jot</h2>
                  <button
                    ref={aboutCloseButton}
                    type="button"
                    class="icon-button"
                    aria-label="Close about dialog"
                    onClick={() => setAboutOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <dl class="about-version-list">
                  <div>
                    <dt>Version</dt>
                    <dd>{APP_VERSION}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </Show>

          <Show
            when={selectedDateCanEdit()}
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
            <section class="editor-region" aria-label="Daily note editor">
              <Show
                when={
                  runtime.imageAttachments !== null &&
                  (cameraStream() !== null || imagePickingSession() !== null || imageAttachmentError() !== null)
                }
              >
                <section class="image-attachment-panel" aria-live="polite">
                  <Show when={cameraStream() !== null}>
                    <div class="camera-capture-panel">
                      <video ref={cameraVideo} playsinline muted />
                      <div class="image-attachment-controls">
                        <button type="button" onClick={() => void captureCameraImage()}>
                          Capture
                        </button>
                        <button type="button" onClick={cancelImageAttachmentSelection}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </Show>
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
                  <Show when={pickedImage() === null && localImageSource() === null && imageAttachmentError()}>
                    {(message) => <p class="image-attachment-error">{message()}</p>}
                  </Show>
                </section>
              </Show>
              <Show
                when={runtime.imageAttachments !== null && (pickedImage() !== null || localImageSource() !== null)}
                fallback={null}
              >
                <div class="modal-backdrop" role="presentation">
                  <div
                    class="image-attachment-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="image-attachment-modal-title"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelImageAttachmentSelection();
                    }}
                  >
                    <div class="image-attachment-modal-header">
                      <h2 id="image-attachment-modal-title">Insert image</h2>
                      <span class="image-attachment-source">
                        {selectedImageSourceLabel(pickedImage(), localImageSource())}
                      </span>
                    </div>
                    <div class="image-attachment-import">
                      <label>
                        Alt text
                        <input
                          ref={imageAltTextInput}
                          type="text"
                          value={imageAttachmentAltText()}
                          onInput={(event) => setImageAttachmentAltText(event.currentTarget.value)}
                        />
                      </label>
                      <Show when={imageAttachmentError()}>
                        {(message) => <p class="image-attachment-error">{message()}</p>}
                      </Show>
                      <Show
                        when={reusableImageAttachment()}
                        fallback={
                          <div class="image-attachment-sizes" aria-label="Image width">
                            {imageAttachmentResolutionChoices().map((resolution) => (
                              <button
                                type="button"
                                disabled={imageAttachmentStatus() === "importing"}
                                onClick={() => void insertSelectedImage(resolution)}
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
                    </div>
                    <div class="modal-actions">
                      <button
                        type="button"
                        disabled={imageAttachmentStatus() === "importing"}
                        onClick={cancelImageAttachmentSelection}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </Show>
              <Show
                when={editorMode() === "wysiwyg"}
                fallback={
                  <PlainTextEditor
                    documentKey={selectedDate()!}
                    resetKey={editorResetKey()}
                    focusAtEnd={focusEditorAtEnd()}
                    focusOffset={focusEditorOffset()}
                    onFocusApplied={() => {
                      setFocusEditorAtEnd(false);
                      setFocusEditorOffset(null);
                    }}
                    onCursorChange={setLastEditorCursorOffset}
                    value={markdown()}
                    onChange={handleEditorChange}
                    onBlur={handleEditorBlur}
                  />
                }
              >
                <MilkdownEditor
                  documentKey={selectedDate()!}
                  resetKey={editorResetKey()}
                  focusAtEnd={focusEditorAtEnd()}
                  focusOffset={focusEditorOffset()}
                  onFocusApplied={() => {
                    setFocusEditorAtEnd(false);
                    setFocusEditorOffset(null);
                  }}
                  onCursorChange={setLastEditorCursorOffset}
                  imageAttachmentDisplays={imageAttachmentDisplays()}
                  value={markdown()}
                  onChange={handleEditorChange}
                  onBlur={handleEditorBlur}
                  onPasteImage={handleEditorImagePaste}
                />
              </Show>
            </section>
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
      await runtime.tokenProvider.getAccessToken({ interactive: true });
    } catch (error: unknown) {
      if (isGooglePopupFailedToOpen(error)) {
        runtime.tokenProvider.redirectForAccessToken();
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
    case "auth-required":
      return "Auth required";
    case "conflict":
      return "Conflict";
    case "error":
      return "Sync error";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAuthReconnectError(error: unknown): boolean {
  if (error instanceof GoogleAccessTokenUnavailableError) return true;
  if (error instanceof GoogleDriveRequestError || error instanceof GooglePhotosRequestError) {
    return isGoogleAuthFailure(error.status, error.responseBody);
  }
  return false;
}

function isGoogleAuthFailure(status: number, responseBody: string): boolean {
  return (
    status === 401 ||
    responseBody.includes("invalid_token") ||
    responseBody.includes("Invalid Credentials") ||
    responseBody.includes("Request is missing required authentication credential")
  );
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

function defaultLocalImageAltText(source: LocalImageAttachmentSource): string {
  return source.filename ?? "";
}

function InsertImageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L9 18" />
      <path d="M16 5v6" />
      <path d="M13 8h6" />
    </svg>
  );
}

function SyncDelayedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function selectedImageSourceLabel(
  picked: PickedGooglePhotosMediaItem | null,
  local: LocalImageAttachmentSource | null
): string {
  if (local !== null) return local.filename ?? localSourceKindLabel(local.kind);
  return picked?.mediaFile?.filename ?? "Selected image";
}

function localSourceKindLabel(kind: LocalImageSourceKind): string {
  switch (kind) {
    case "device-upload":
      return "Device image";
    case "device-camera":
      return "Camera image";
    case "clipboard":
      return "Clipboard image";
  }
}

function imageAttachmentStatusLabel(status: ImageAttachmentStatus): string {
  switch (status) {
    case "idle":
      return "";
    case "starting":
      return "Selecting image...";
    case "waiting":
      return "Waiting for image selection...";
    case "choosing":
      return "Image selected";
    case "importing":
      return "Importing image...";
  }
}

function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("The camera is not ready yet.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Could not capture the camera image.");
  }
  context.drawImage(video, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("Could not capture the camera image."));
        } else {
          resolve(blob);
        }
      },
      "image/jpeg",
      0.9
    );
  });
}

function stopCameraStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
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
