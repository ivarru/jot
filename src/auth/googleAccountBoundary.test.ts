import "fake-indexeddb/auto";
import { googleAccountValidator, GOOGLE_ACCOUNT_KEY } from "./googleAccountBoundary";
import { GoogleIdentityTokenProvider } from "./googleIdentity";
import { IndexedDbLocalDraftStore } from "~/storage/localDraftStore";
import { SessionGuardedDraftStore } from "~/storage/sessionGuardedDraftStore";
import { GoogleDriveStorageProvider } from "~/storage/googleDriveStorage";
import { syncDailyNote } from "~/sync/dailyNoteReplication/replicationCore";
import { sessionScopedProvider } from "./sessionScopedProvider";

const base = new IndexedDbLocalDraftStore();
const note = {date: "2030-02-02" as const, markdown: "synthetic private A note", baselineMarkdown: "", baselineRevisionId: null, dirty: true, updatedAt: "2030-01-01T00:00:00.000Z"};
const identity = (id: string) => new Response(JSON.stringify({user: {permissionId: id}}));
afterEach(async () => { await base.clearAll(); localStorage.clear(); sessionStorage.clear(); delete window.google; });

it("rejects account B before retained account A content reaches Drive", async () => {
  const drafts = new SessionGuardedDraftStore(base, localStorage);
  let account = "A";
  const client = {callback: (_: unknown) => {}, requestAccessToken() {client.callback({access_token: account, expires_in: 3600});}};
  window.google = {accounts: {oauth2: {initTokenClient: () => client, revoke: (_: string, done: () => void) => done()}}};
  const about = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => identity(new Headers(init?.headers).get("Authorization")!.slice(7)));
  const validate = googleAccountValidator(localStorage, about as typeof fetch, base);
  const original = new GoogleIdentityTokenProvider("review", ["scope"], document, validate);
  await original.getAccessToken({interactive: true});
  await drafts.save(note);
  original.invalidateAccessToken();
  account = "B";
  const replacement = new GoogleIdentityTokenProvider("review", ["scope"], document, validate);
  await expect(replacement.getAccessToken({interactive: true})).rejects.toThrow("different Google account");
  const dataFetch = vi.fn();
  const remote = new GoogleDriveStorageProvider(replacement, dataFetch);
  await expect(syncDailyNote(note.date, drafts, remote)).rejects.toThrow("different Google account");
  expect(dataFetch).not.toHaveBeenCalled();
  expect(localStorage.getItem(GOOGLE_ACCOUNT_KEY)).toBe("A");
  await expect(base.load(note.date)).resolves.toEqual(note);
  expect(about).toHaveBeenCalledWith("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)", {method: "GET", headers: {Authorization: "Bearer B"}, cache: "no-store"});
});

it("keeps legacy drafts untouched until ownership is explicitly confirmed", async () => {
  await base.save(note);
  const confirm = vi.fn(() => false);
  const validate = googleAccountValidator(localStorage, vi.fn(async () => identity("A")), base, confirm);
  await expect(validate("token", () => true)).rejects.toThrow("unchanged");
  expect(localStorage.getItem(GOOGLE_ACCOUNT_KEY)).toBeNull();
  await expect(base.load(note.date)).resolves.toEqual(note);
  confirm.mockReturnValue(true);
  await validate("token", () => true);
  expect(localStorage.getItem(GOOGLE_ACCOUNT_KEY)).toBe("A");
  await validate("token", () => true);
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("does not claim an account when sign-out occurs during identity verification", async () => {
  const drafts = new SessionGuardedDraftStore(base, localStorage);
  let release!: (response: Response) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const validate = googleAccountValidator(localStorage, () => new Promise(resolve => {release = resolve; started();}), base);
  const pending = validate("old-token", () => true);
  await ready;
  await drafts.clearForSignOut();
  release(identity("A"));
  await expect(pending).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
  expect(localStorage.getItem(GOOGLE_ACCOUNT_KEY)).toBeNull();
});

it.each([new Response("denied", {status: 403}), new Response("{}")])("fails closed when Google cannot identify the account", async response => {
  const validate = googleAccountValidator(localStorage, vi.fn(async () => response), base);
  await expect(validate("token", () => true)).rejects.toThrow();
  expect(localStorage.getItem(GOOGLE_ACCOUNT_KEY)).toBeNull();
});

it("sign-out removes account binding only with draft clearing", async () => {
  const drafts = new SessionGuardedDraftStore(base, localStorage);
  localStorage.setItem(GOOGLE_ACCOUNT_KEY, "A");
  await drafts.save(note);
  await drafts.clearForSignOut();
  expect(localStorage.getItem(GOOGLE_ACCOUNT_KEY)).toBeNull();
  await expect(base.load(note.date)).resolves.toBeNull();
});

it("old provider operations cannot borrow replacement-session tokens or caches", async () => {
  let generation = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  const factory = vi.fn(scoped => ({
    async loadSettings() { await held; return await scoped.getAccessToken(); },
    async saveSettings() { return await scoped.getAccessToken(); }
  }));
  const remote = sessionScopedProvider({getAccessToken: async () => generation === 0 ? "A" : "B", captureSession: () => {const own = generation; return () => own === generation;}}, factory);
  const old = remote.loadSettings();
  generation++;
  await expect(remote.saveSettings()).resolves.toBe("B");
  release();
  await expect(old).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
  expect(factory).toHaveBeenCalledTimes(2);
});

it("a rejected restored redirect token does not trap the next sign-in on the wrong account", async () => {
  localStorage.setItem(GOOGLE_ACCOUNT_KEY, "A");
  sessionStorage.setItem("jot.googleAccessToken.review", JSON.stringify({epoch: null, accessToken: "B", expiresAtMs: Date.now()+3600000}));
  const client = {callback: (_: unknown) => {}, requestAccessToken() { client.callback({access_token: "A", expires_in: 3600}); }};
  window.google = {accounts: {oauth2: {initTokenClient: () => client, revoke: (_: string, done: () => void) => done()}}};
  const validate = googleAccountValidator(localStorage, async (_url, init) => identity(new Headers(init?.headers).get("Authorization")!.slice(7)), base);
  const tokens = new GoogleIdentityTokenProvider("review", ["scope"], document, validate);
  await expect(tokens.getAccessToken({interactive: true})).rejects.toThrow("different Google account");
  expect(sessionStorage.getItem("jot.googleAccessToken.review")).toBeNull();
  await expect(tokens.getAccessToken({interactive: true})).resolves.toBe("A");
});

it("can reopen offline with a previously verified token, but cannot trust an unverified replacement", async () => {
  const { webcrypto } = await import("node:crypto");
  const cryptoBefore = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {value: webcrypto, configurable: true});
  try {
    const validate = googleAccountValidator(localStorage, async () => identity("A"), base);
    await validate("verified-A-token", () => true);
    const offline = vi.fn(async () => {throw new TypeError("offline");});
    const restored = googleAccountValidator(localStorage, offline, base);
    await expect(restored("verified-A-token", () => true)).resolves.toBeUndefined();
    expect(offline).not.toHaveBeenCalled();
    await expect(restored("unverified-B-token", () => true)).rejects.toThrow();
    localStorage.setItem("jot.accountEpoch", "new-session");
    await expect(restored("verified-A-token", () => true)).rejects.toThrow();
  } finally { Object.defineProperty(globalThis, "crypto", {value: cryptoBefore, configurable: true}); }
});
