import type { SyncStatus } from "~/storage/types";

export type GoogleTokenRenewalResult =
  | { readonly type: "renewed" }
  | { readonly type: "aborted" }
  | { readonly type: "reconnect"; readonly editsSynced: boolean };

export interface GoogleTokenRenewalActions {
  readonly syncVisibleEdits: (() => Promise<void>) | null;
  readonly syncBackgroundDrafts: () => Promise<void>;
  readonly canContinue: () => boolean;
  readonly editsSynced: () => Promise<boolean>;
  readonly renewSilently: () => Promise<void>;
  readonly invalidateToken: () => void;
  readonly onAbort?: () => void;
}

export function shouldSyncVisibleEditsBeforeRenewal(input: {
  readonly editorSnapshotChanged: boolean;
  readonly selectedDraftMatchesSnapshot: boolean;
  readonly selectedDraftDirty: boolean;
  readonly status: SyncStatus;
}): boolean {
  return (
    input.editorSnapshotChanged ||
    !input.selectedDraftMatchesSnapshot ||
    input.selectedDraftDirty ||
    input.status === "local-only" ||
    input.status === "saved-locally"
  );
}

/**
 * Uses the still-valid token for every pending save before attempting a no-UI renewal.
 * Keeping this sequence independent of the route makes the ordering explicit and testable.
 */
export async function performGoogleTokenRenewal(
  actions: GoogleTokenRenewalActions
): Promise<GoogleTokenRenewalResult> {
  if (actions.syncVisibleEdits !== null) {
    await actions.syncVisibleEdits();
    if (!actions.canContinue()) {
      actions.onAbort?.();
      return { type: "aborted" };
    }
  }

  await actions.syncBackgroundDrafts();
  if (!actions.canContinue()) {
    actions.onAbort?.();
    return { type: "aborted" };
  }

  try {
    await actions.renewSilently();
    return { type: "renewed" };
  } catch {
    actions.invalidateToken();
    const editsSynced = await actions.editsSynced();
    return { type: "reconnect", editsSynced };
  }
}
