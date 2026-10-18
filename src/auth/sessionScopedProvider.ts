import type { AccessTokenProvider } from "./accessTokenProvider";
import { GoogleAuthCancelledError } from "./googleIdentity";

export function captureTokenSession(tokens: Pick<AccessTokenProvider, "captureSession">): () => void {
  const current = tokens.captureSession?.() ?? (() => true);
  return () => { if (!current()) throw new GoogleAuthCancelledError(); };
}

export function sessionTokenProvider(tokens: AccessTokenProvider, check = captureTokenSession(tokens)): AccessTokenProvider {
  return {
    async getAccessToken(request) {
      check();
      const token = await tokens.getAccessToken(request);
      check();
      return token;
    },
    invalidateAccessToken() { check(); tokens.invalidateAccessToken?.(); },
    captureSession() { return () => { try { check(); return true; } catch { return false; } }; }
  };
}

/** Retain caches within a session; old method calls keep their old credential boundary. */
export function sessionScopedProvider<T extends object>(tokens: AccessTokenProvider, create: (scoped: AccessTokenProvider) => T): T {
  let current = () => false;
  let instance: T;
  return new Proxy({} as T, {
    get(_target, key) {
      if (!current()) {
        current = tokens.captureSession?.() ?? (() => true);
        instance = create(sessionTokenProvider(tokens));
      }
      const value = Reflect.get(instance, key);
      return typeof value === "function" ? value.bind(instance) : value;
    }
  });
}
