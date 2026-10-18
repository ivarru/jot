import { GoogleAuthCancelledError } from "./googleIdentity";
import { IndexedDbLocalDraftStore } from "~/storage/localDraftStore";

export const GOOGLE_ACCOUNT_KEY = "jot.googleAccountId";

export class GoogleAccountBoundaryError extends Error {
  constructor(message: string) { super(message); this.name = "GoogleAccountBoundaryError"; }
}

/** Candidate credentials may identify an account, but cannot access notes until this succeeds. */
export function googleAccountValidator(
  storage: Storage = localStorage,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
  drafts = new IndexedDbLocalDraftStore(),
  confirmLegacy = () => window.confirm("This browser has local notes from before account checks were added. Only continue if you selected the Google account these notes belong to. Use these local notes with the selected account?")
): (token: string, isCurrent: () => boolean) => Promise<void> {
  return async (token, isCurrent) => {
    const epoch = storage.getItem("jot.accountEpoch");
    const current = () => isCurrent() && epoch === storage.getItem("jot.accountEpoch");
    // Reopening offline may reuse proof for this exact previously verified token.
    // Store only a digest, never another copy of the bearer credential.
    const digest = await tokenDigest(token);
    if (!current()) throw new GoogleAuthCancelledError();
    const proof = readProof();
    if (digest !== null && proof?.digest === digest && proof.epoch === epoch
      && proof.account === storage.getItem(GOOGLE_ACCOUNT_KEY)) return;
    const response = await fetchFn("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)", {
      method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
    });
    if (!current()) throw new GoogleAuthCancelledError();
    if (!response.ok) throw new GoogleAccountBoundaryError("Google account verification failed. Please sign in again and allow Drive access.");
    const data = await response.json() as { user?: { permissionId?: unknown } };
    const account = data.user?.permissionId;
    if (typeof account !== "string" || !account) throw new GoogleAccountBoundaryError("Google did not identify the selected account. Please try again.");
    const bind = async () => {
      if (!current()) throw new GoogleAuthCancelledError();
      const owner = storage.getItem(GOOGLE_ACCOUNT_KEY);
      if (owner !== null && owner !== account) {
        throw new GoogleAccountBoundaryError("These local notes belong to a different Google account. Sign in with the original account. To switch accounts, first sign in with the original account and sign out.");
      }
      if (owner === null) {
        const [dirty, dates] = await Promise.all([drafts.listDirty(), drafts.listExistingDailyNoteDates()]);
        if (!current()) throw new GoogleAuthCancelledError();
        if ((dirty.length > 0 || dates.length > 0) && !confirmLegacy()) {
          throw new GoogleAccountBoundaryError("Your local notes are unchanged. Sign in with the account they belong to and confirm ownership to continue.");
        }
        if (!current()) throw new GoogleAuthCancelledError();
        storage.setItem(GOOGLE_ACCOUNT_KEY, account);
      }
    };
    const locks = globalThis.navigator?.locks;
    if (locks) await locks.request("jot:local-draft-mutation", bind);
    else await bind();
    if (!current()) throw new GoogleAuthCancelledError();
    if (digest !== null) {
      try { sessionStorage.setItem("jot.googleAccountProof", JSON.stringify({digest, account, epoch})); }
      catch { /* Without optional proof storage, next restore verifies online. */ }
    }
  };
}

async function tokenDigest(token: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

function readProof(): {digest: string; account: string; epoch: string | null} | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem("jot.googleAccountProof") ?? "null");
    if (parsed && typeof parsed.digest === "string" && typeof parsed.account === "string"
      && (parsed.epoch === null || typeof parsed.epoch === "string")) return parsed;
  } catch { /* A missing/malformed proof cannot establish identity. */ }
  return null;
}
