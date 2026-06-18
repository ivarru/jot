import { GoogleAccessTokenUnavailableError, GoogleIdentityTokenProvider } from "./googleIdentity";

describe("GoogleIdentityTokenProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete window.google;
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    document.head.replaceChildren();
  });

  it("reuses cached access tokens and accepts a no-UI renewal result after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const tokenClient = {
      callback: (_response: unknown) => undefined,
      requestAccessToken: vi.fn(() => {
        tokenClient.callback({
          access_token: `token-${tokenClient.requestAccessToken.mock.calls.length}`,
          expires_in: 120
        });
      })
    };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => tokenClient),
          revoke: vi.fn((_token: string, done: () => void) => done())
        }
      }
    };
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);

    await expect(provider.getAccessToken({ interactive: true })).resolves.toBe("token-1");
    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    vi.setSystemTime(61000);

    // This covers our wrapper behavior when GIS returns a token. Google does not guarantee
    // that no-UI renewal succeeds outside a user-driven token flow; keep the failure case below.
    await expect(provider.getAccessToken()).resolves.toBe("token-2");
    expect(tokenClient.requestAccessToken).toHaveBeenNthCalledWith(2, { prompt: "none" });
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(2);
    await expect(provider.getAccessToken()).resolves.toBe("token-2");
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent token renewal attempts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    let resolveToken: (value: unknown) => void = () => {
      throw new Error("Token request was not started.");
    };
    const tokenClient = {
      callback: (_response: unknown) => undefined,
      requestAccessToken: vi.fn(() => {
        resolveToken = tokenClient.callback;
      })
    };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => tokenClient),
          revoke: vi.fn((_token: string, done: () => void) => done())
        }
      }
    };
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);
    const first = provider.getAccessToken();
    const second = provider.getAccessToken();
    await Promise.resolve();
    await Promise.resolve();

    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(1);
    resolveToken({ access_token: "renewed-token", expires_in: 120 });

    await expect(first).resolves.toBe("renewed-token");
    await expect(second).resolves.toBe("renewed-token");
  });

  it("reports a reconnect requirement when no-UI token renewal fails", async () => {
    const tokenClient = {
      callback: (_response: unknown) => undefined,
      requestAccessToken: vi.fn(() => {
        tokenClient.callback({ error: "interaction_required" });
      })
    };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => tokenClient),
          revoke: vi.fn((_token: string, done: () => void) => done())
        }
      }
    };
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(GoogleAccessTokenUnavailableError);
    expect(tokenClient.requestAccessToken).toHaveBeenCalledWith({ prompt: "none" });
  });

  it("initializes the token client without requesting a token", async () => {
    const tokenClient = {
      callback: (_response: unknown) => undefined,
      requestAccessToken: vi.fn()
    };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => tokenClient),
          revoke: vi.fn((_token: string, done: () => void) => done())
        }
      }
    };
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);

    await provider.initialize();

    expect(window.google.accounts.oauth2.initTokenClient).toHaveBeenCalledTimes(1);
    expect(tokenClient.requestAccessToken).not.toHaveBeenCalled();
  });

  it("rejects when Google reports a popup error", async () => {
    const tokenClient = {
      callback: (_response: unknown) => undefined,
      error_callback: (_error: unknown) => undefined,
      requestAccessToken: vi.fn(() => {
        tokenClient.error_callback({ type: "popup_failed_to_open" });
      })
    };
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => tokenClient),
          revoke: vi.fn((_token: string, done: () => void) => done())
        }
      }
    };
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);

    await expect(provider.getAccessToken({ interactive: true })).rejects.toThrow("popup_failed_to_open");
  });

  it("redirects for an access token with the current date route in state", () => {
    window.history.replaceState(null, "", "/#/date/2026-05-28");
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope-a", "scope-b"]);
    const navigate = vi.fn();

    provider.redirectForAccessToken({ prompt: "consent" }, navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0]?.[0] ?? "");
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/");
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("scope")).toBe("scope-a scope-b");
    expect(url.searchParams.get("prompt")).toBe("consent");

    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(window.sessionStorage.getItem(`jot.googleOAuthRedirect.${state}`)).toContain("#/date/2026-05-28");
  });

  it("consumes a redirected access token and restores the original date route", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);
    window.sessionStorage.setItem(
      "jot.googleOAuthRedirect.test-state",
      JSON.stringify({ createdAtMs: 0, hash: "#/date/2026-05-28" })
    );
    window.history.replaceState(
      null,
      "",
      "/#access_token=redirect-token&expires_in=120&state=test-state"
    );

    expect(provider.consumeRedirectAccessToken()).toEqual({ type: "authenticated" });
    expect(window.location.hash).toBe("#/date/2026-05-28");
    await expect(provider.getAccessToken()).resolves.toBe("redirect-token");
  });

  it("consumes a redirected access token when Google returns state before the token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);
    window.sessionStorage.setItem(
      "jot.googleOAuthRedirect.test-state",
      JSON.stringify({ createdAtMs: 0, hash: "#/date/2026-05-28" })
    );
    window.history.replaceState(
      null,
      "",
      "/#state=test-state&access_token=redirect-token&expires_in=120"
    );

    expect(provider.consumeRedirectAccessToken()).toEqual({ type: "authenticated" });
    expect(window.location.hash).toBe("#/date/2026-05-28");
    await expect(provider.getAccessToken()).resolves.toBe("redirect-token");
  });

  it("restores a redirected access token after same-tab navigation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);
    window.sessionStorage.setItem(
      "jot.googleOAuthRedirect.test-state",
      JSON.stringify({ createdAtMs: 0, hash: "#/date/2026-05-28" })
    );
    window.history.replaceState(
      null,
      "",
      "/#state=test-state&access_token=redirect-token&expires_in=120"
    );

    expect(provider.consumeRedirectAccessToken()).toEqual({ type: "authenticated" });
    const nextProvider = new GoogleIdentityTokenProvider("client-id", ["scope"]);

    await expect(nextProvider.getAccessToken()).resolves.toBe("redirect-token");
  });

  it("clears the stored access token on revoke", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const revoke = vi.fn((_token: string, done: () => void) => done());
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(),
          revoke
        }
      }
    };
    window.sessionStorage.setItem(
      "jot.googleAccessToken.client-id",
      JSON.stringify({ accessToken: "stored-token", expiresAtMs: 120000 })
    );
    const provider = new GoogleIdentityTokenProvider("client-id", ["scope"]);

    await provider.revoke();

    expect(revoke).toHaveBeenCalledWith("stored-token", expect.any(Function));
    expect(window.sessionStorage.getItem("jot.googleAccessToken.client-id")).toBeNull();
  });
});
