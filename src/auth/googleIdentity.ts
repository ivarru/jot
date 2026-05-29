import type { AccessTokenProvider, AccessTokenRequest } from "./accessTokenProvider";

const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const ACCESS_TOKEN_STORAGE_PREFIX = "jot.googleAccessToken.";
const REDIRECT_STATE_STORAGE_PREFIX = "jot.googleOAuthRedirect.";
const REDIRECT_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly error?: string;
  readonly error_description?: string;
  readonly scope?: string;
}

export type GoogleRedirectAccessTokenResult =
  | { readonly type: "none" }
  | { readonly type: "authenticated" }
  | { readonly type: "error"; readonly message: string };

interface RedirectState {
  readonly createdAtMs: number;
  readonly hash: string;
}

interface StoredAccessToken {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: unknown) => void;
  requestAccessToken(request?: AccessTokenRequest): void;
}

interface GoogleIdentityApi {
  readonly accounts: {
    readonly oauth2: {
      initTokenClient(config: {
        readonly client_id: string;
        readonly scope: string;
        readonly callback: (response: GoogleTokenResponse) => void;
        readonly error_callback?: (error: unknown) => void;
      }): GoogleTokenClient;
      revoke(token: string, done: () => void): void;
    };
  };
}

export class GoogleAccessTokenUnavailableError extends Error {
  constructor() {
    super("Reconnect to Google to continue syncing.");
    this.name = "GoogleAccessTokenUnavailableError";
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

export class GoogleIdentityTokenProvider implements AccessTokenProvider {
  private tokenClient: GoogleTokenClient | null = null;
  private accessToken: string | null = null;
  private accessTokenExpiresAtMs = 0;
  private readonly scopes: string;

  constructor(
    private readonly clientId: string,
    scopes: readonly string[],
    private readonly documentRef: Document = document
  ) {
    this.scopes = scopes.join(" ");
    this.restoreStoredAccessToken();
  }

  async initialize(): Promise<void> {
    await this.getTokenClient();
  }

  consumeRedirectAccessToken(): GoogleRedirectAccessTokenResult {
    const params = oauthFragmentParams(window.location.hash);
    if (params === null) return { type: "none" };

    const state = params.get("state") ?? "";
    const storedState = this.consumeRedirectState(state);
    this.restoreHash(storedState?.hash ?? "");

    const oauthError = params.get("error");
    if (oauthError) {
      const description = params.get("error_description");
      return { type: "error", message: description ?? oauthError };
    }

    if (storedState === null) {
      return { type: "error", message: "Google sign-in returned with an invalid state." };
    }

    const accessToken = params.get("access_token");
    if (!accessToken) {
      return { type: "error", message: "Google did not return an access token." };
    }

    const expiresIn = Number(params.get("expires_in") ?? "3600");
    this.storeAccessToken(accessToken, Number.isFinite(expiresIn) ? expiresIn : 3600);
    return { type: "authenticated" };
  }

  redirectForAccessToken(
    request: AccessTokenRequest = {},
    navigate: (url: string) => void = (url) => window.location.assign(url)
  ): void {
    const state = createRedirectNonce();
    const currentHash = window.location.hash.startsWith("#/date/") ? window.location.hash : "";
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    window.sessionStorage.setItem(
      redirectStateStorageKey(state),
      JSON.stringify({ createdAtMs: Date.now(), hash: currentHash } satisfies RedirectState)
    );

    const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "token");
    url.searchParams.set("scope", this.scopes);
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    if (request.prompt !== undefined) {
      url.searchParams.set("prompt", request.prompt);
    }

    navigate(url.toString());
  }

  async getAccessToken(request: AccessTokenRequest = {}): Promise<string> {
    const cachedToken = this.getUsableCachedToken();
    if (cachedToken !== null && request.prompt !== "consent" && request.prompt !== "select_account") {
      return cachedToken;
    }

    if (request.interactive !== true) {
      throw new GoogleAccessTokenUnavailableError();
    }

    const client = await this.getTokenClient();

    return await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Google sign-in is still waiting. Try again if the popup was closed or blocked."));
      }, TOKEN_REQUEST_TIMEOUT_MS);
      const finish = (result: () => void) => {
        window.clearTimeout(timeout);
        result();
      };

      client.callback = (response) => {
        if (response.error) {
          finish(() => reject(new Error(response.error_description ?? response.error)));
          return;
        }

        if (!response.access_token) {
          finish(() => reject(new Error("Google did not return an access token.")));
          return;
        }

        const accessToken = response.access_token;
        this.storeAccessToken(accessToken, response.expires_in ?? 3600);
        finish(() => resolve(accessToken));
      };
      client.error_callback = (error) => {
        finish(() => reject(new Error(googleErrorMessage(error))));
      };

      client.requestAccessToken(request);
    });
  }

  async revoke(): Promise<void> {
    const token = this.getUsableCachedToken();
    this.clearStoredAccessToken();
    if (token === null || !window.google) return;

    await new Promise<void>((resolve) => {
      window.google?.accounts.oauth2.revoke(token, resolve);
    });
  }

  invalidateAccessToken(): void {
    this.clearStoredAccessToken();
  }

  private getUsableCachedToken(): string | null {
    if (this.accessToken === null || Date.now() >= this.accessTokenExpiresAtMs) {
      this.restoreStoredAccessToken();
    }
    return this.accessToken !== null && Date.now() < this.accessTokenExpiresAtMs ? this.accessToken : null;
  }

  private storeAccessToken(accessToken: string, expiresInSeconds: number): void {
    this.accessToken = accessToken;
    this.accessTokenExpiresAtMs = Date.now() + Math.max(expiresInSeconds - 60, 0) * 1000;
    getSessionStorage()?.setItem(
      accessTokenStorageKey(this.clientId),
      JSON.stringify({
        accessToken: this.accessToken,
        expiresAtMs: this.accessTokenExpiresAtMs
      } satisfies StoredAccessToken)
    );
  }

  private restoreStoredAccessToken(): void {
    const stored = getSessionStorage()?.getItem(accessTokenStorageKey(this.clientId));
    if (stored === undefined || stored === null) return;

    try {
      const parsed = JSON.parse(stored) as Partial<StoredAccessToken>;
      if (
        typeof parsed.accessToken !== "string" ||
        typeof parsed.expiresAtMs !== "number" ||
        Date.now() >= parsed.expiresAtMs
      ) {
        this.clearStoredAccessToken();
        return;
      }
      this.accessToken = parsed.accessToken;
      this.accessTokenExpiresAtMs = parsed.expiresAtMs;
    } catch {
      this.clearStoredAccessToken();
    }
  }

  private clearStoredAccessToken(): void {
    this.accessToken = null;
    this.accessTokenExpiresAtMs = 0;
    getSessionStorage()?.removeItem(accessTokenStorageKey(this.clientId));
  }

  private consumeRedirectState(state: string): RedirectState | null {
    if (!state) return null;
    const key = redirectStateStorageKey(state);
    const value = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    if (value === null) return null;

    try {
      const parsed = JSON.parse(value) as Partial<RedirectState>;
      if (
        typeof parsed.createdAtMs !== "number" ||
        typeof parsed.hash !== "string" ||
        Date.now() - parsed.createdAtMs > REDIRECT_STATE_TTL_MS
      ) {
        return null;
      }
      return { createdAtMs: parsed.createdAtMs, hash: parsed.hash };
    } catch {
      return null;
    }
  }

  private restoreHash(hash: string): void {
    const nextHash = hash || "#/";
    const nextUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }

  private async getTokenClient(): Promise<GoogleTokenClient> {
    if (this.tokenClient !== null) return this.tokenClient;

    await this.loadGoogleIdentityScript();

    if (!window.google) {
      throw new Error("Google Identity Services failed to load.");
    }

    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: this.scopes,
      callback: () => undefined,
      error_callback: () => undefined
    });

    return this.tokenClient;
  }

  private async loadGoogleIdentityScript(): Promise<void> {
    if (window.google) return;

    const existing = this.documentRef.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`
    );
    if (existing) {
      await waitForScript(existing);
      return;
    }

    const script = this.documentRef.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    this.documentRef.head.append(script);
    await waitForScript(script);
  }
}

export function isGooglePopupFailedToOpen(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === "popup_failed_to_open" || error.message === "Failed to open popup window";
}

function googleErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "Google sign-in failed.";
  if ("message" in error && typeof error.message === "string") return error.message;
  if ("type" in error && typeof error.type === "string") return error.type;
  return "Google sign-in failed.";
}

function oauthFragmentParams(hash: string): URLSearchParams | null {
  if (!hash.startsWith("#")) return null;
  const fragment = hash.slice(1);
  if (fragment.startsWith("/")) return null;
  const params = new URLSearchParams(fragment);
  return params.has("access_token") || params.has("error") ? params : null;
}

function redirectStateStorageKey(state: string): string {
  return `${REDIRECT_STATE_STORAGE_PREFIX}${state}`;
}

function accessTokenStorageKey(clientId: string): string {
  return `${ACCESS_TOKEN_STORAGE_PREFIX}${clientId}`;
}

function getSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function createRedirectNonce(): string {
  const cryptoApi = window.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function waitForScript(script: HTMLScriptElement): Promise<void> {
  if (script.dataset.loaded === "true") return Promise.resolve();

  return new Promise((resolve, reject) => {
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")));
  });
}
