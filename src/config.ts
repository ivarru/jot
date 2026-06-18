export const LOCAL_DRAFT_DEBOUNCE_MS = 250;

export const FORCE_FAKE_STORAGE = import.meta.env.VITE_ENABLE_FAKE_AUTH === "true";
export const ENABLE_FAKE_AUTH = import.meta.env.DEV || FORCE_FAKE_STORAGE;

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export const APP_VERSION = __APP_VERSION__;
export const APP_PROJECT_URL = __APP_PROJECT_URL__;
export const APP_LICENSE = __APP_LICENSE__;
export const APP_COPYRIGHT = __APP_COPYRIGHT__;
export const MILKDOWN_VERSION = __MILKDOWN_VERSION__;
