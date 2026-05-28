import { GoogleIdentityTokenProvider } from "./googleIdentity";

describe("GoogleIdentityTokenProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete window.google;
    document.head.replaceChildren();
  });

  it("refreshes cached access tokens before reusing expired tokens", async () => {
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

    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    vi.setSystemTime(61000);
    await expect(provider.getAccessToken()).resolves.toBe("token-2");
    expect(tokenClient.requestAccessToken).toHaveBeenCalledTimes(2);
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

    await expect(provider.getAccessToken()).rejects.toThrow("popup_failed_to_open");
  });
});
