import { GoogleIdentityTokenProvider } from "./googleIdentity";
function installGoogle() {
  const client = { callback: (_: { access_token?: string; expires_in?: number }) => {}, requestAccessToken: vi.fn() };
  window.google = { accounts: { oauth2: { initTokenClient: () => client, revoke: (_: string, done: () => void) => done() } } };
  return client;
}
afterEach(async () => {
  vi.useRealTimers();
  document.head.replaceChildren();
  delete window.google;
  sessionStorage.clear(); localStorage.clear();
  window.history.replaceState(null, "", "/");
});

it.each(["invalidate", "revoke"])("rejects a late callback after %s", async (action) => {
  const client = installGoogle();
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  await provider.initialize();
  const pending = provider.getAccessToken({ interactive: true }).catch(() => undefined);
  await vi.waitFor(() => expect(client.requestAccessToken).toHaveBeenCalled());
  if (action === "revoke") await provider.revoke(); else provider.invalidateAccessToken();
  client.callback({ access_token: "synthetic-late-token", expires_in: 3600 });
  await pending.catch(() => undefined);
  expect(sessionStorage.getItem("jot.googleAccessToken.review-client")).toBeNull();
});

it("rejects a token callback after the request timeout", async () => {
  vi.useFakeTimers();
  const client = installGoogle();
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  await provider.initialize();
  const pending = provider.getAccessToken({ interactive: true }).catch(() => undefined);
  await Promise.resolve(); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(120001);
  await pending;
  client.callback({ access_token: "synthetic-timed-out-token", expires_in: 3600 });
  expect(sessionStorage.getItem("jot.googleAccessToken.review-client")).toBeNull();
});

it("rejects an outstanding redirect after another tab signs out", () => {
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  let target = "";
  provider.redirectForAccessToken({}, url => { target = url; });
  const state = new URL(target).searchParams.get("state");
  localStorage.setItem("jot.accountEpoch", "signed-out-generation");
  provider.invalidateAccessToken();
  window.history.replaceState(null, "", `/#access_token=synthetic-old-session&state=${state}&expires_in=3600`);
  expect(provider.consumeRedirectAccessToken().type).toBe("error");
});

it.each(["missing", "expired", "replayed"])("rejects %s redirect state and removes the token fragment", kind => {
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  if (kind !== "missing") sessionStorage.setItem("jot.googleOAuthRedirect.state", JSON.stringify({epoch: null, createdAtMs: kind === "expired" ? Date.now()-600001 : Date.now(), hash: "#/date/2030-02-02"}));
  const url = "/#access_token=synthetic-token&state=state&expires_in=3600";
  window.history.replaceState(null, "", url);
  if (kind === "replayed") {
    expect(provider.consumeRedirectAccessToken().type).toBe("authenticated");
    provider.invalidateAccessToken();
    window.history.replaceState(null, "", url);
  }
  expect(provider.consumeRedirectAccessToken().type).toBe("error");
  expect(window.location.hash).not.toContain("access_token");
  expect(sessionStorage.getItem("jot.googleAccessToken.review-client")).toBeNull();
});


it("does not start a token request when initialization finishes after invalidation", async () => {
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  const pending = provider.getAccessToken({interactive: true}).catch(() => undefined);
  await vi.waitFor(() => expect(document.querySelector("script[src='https://accounts.google.com/gsi/client']")).not.toBeNull());
  provider.invalidateAccessToken();
  const client = installGoogle();
  document.querySelector("script[src='https://accounts.google.com/gsi/client']")!.dispatchEvent(new Event("load"));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(client.requestAccessToken).not.toHaveBeenCalled();
  client.callback({access_token: "late-init", expires_in: 3600});
  await pending;
});

it("an old callback cannot replace a newer successful session", async () => {
  const clients: ReturnType<typeof installGoogle>[] = [];
  installGoogle();
  window.google!.accounts.oauth2.initTokenClient = () => {
    const client = {callback: (_: {access_token?: string; expires_in?: number}) => {}, requestAccessToken: vi.fn()};
    clients.push(client); return client;
  };
  const provider = new GoogleIdentityTokenProvider("review-client", ["scope"]);
  const oldRequest = provider.getAccessToken({interactive: true}).catch(() => undefined);
  await vi.waitFor(() => expect(clients[0]?.requestAccessToken).toHaveBeenCalled());
  provider.invalidateAccessToken();
  await oldRequest;
  const next = provider.getAccessToken({interactive: true});
  await vi.waitFor(() => expect(clients[1]?.requestAccessToken).toHaveBeenCalled());
  clients[1]!.callback({access_token: "new-session", expires_in: 3600});
  await expect(next).resolves.toBe("new-session");
  clients[0]!.callback({access_token: "old-session", expires_in: 3600});
  await expect(provider.getAccessToken()).resolves.toBe("new-session");
});
