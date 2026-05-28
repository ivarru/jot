import type { AccessTokenProvider, AccessTokenRequest } from "./accessTokenProvider";

const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const TOKEN_REQUEST_TIMEOUT_MS = 30000;

interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly error?: string;
  readonly error_description?: string;
  readonly scope?: string;
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
  }

  async initialize(): Promise<void> {
    await this.getTokenClient();
  }

  async getAccessToken(request: AccessTokenRequest = {}): Promise<string> {
    const cachedToken = this.getUsableCachedToken();
    if (cachedToken !== null && request.prompt !== "consent" && request.prompt !== "select_account") {
      return cachedToken;
    }

    const client = await this.getTokenClient();

    return await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Google sign-in did not complete within 30 seconds."));
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
        this.accessToken = accessToken;
        this.accessTokenExpiresAtMs = Date.now() + ((response.expires_in ?? 3600) - 60) * 1000;
        finish(() => resolve(accessToken));
      };
      client.error_callback = (error) => {
        finish(() => reject(new Error(googleErrorMessage(error))));
      };

      client.requestAccessToken(request);
    });
  }

  async revoke(): Promise<void> {
    if (this.accessToken === null || !window.google) return;

    await new Promise<void>((resolve) => {
      window.google?.accounts.oauth2.revoke(this.accessToken!, resolve);
    });
    this.accessToken = null;
    this.accessTokenExpiresAtMs = 0;
  }

  private getUsableCachedToken(): string | null {
    return this.accessToken !== null && Date.now() < this.accessTokenExpiresAtMs ? this.accessToken : null;
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

function googleErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "Google sign-in failed.";
  if ("message" in error && typeof error.message === "string") return error.message;
  if ("type" in error && typeof error.type === "string") return error.type;
  return "Google sign-in failed.";
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
