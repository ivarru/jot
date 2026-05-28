export const LOCAL_DRAFT_DEBOUNCE_MS = 250;

export const FORCE_FAKE_STORAGE = import.meta.env.VITE_ENABLE_FAKE_AUTH === "true";
export const ENABLE_FAKE_AUTH = import.meta.env.DEV || FORCE_FAKE_STORAGE;

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
