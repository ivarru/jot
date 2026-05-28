export const LOCAL_DRAFT_DEBOUNCE_MS = 250;

export const ENABLE_FAKE_AUTH = import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_AUTH === "true";
export const ENABLE_IMAGE_ATTACHMENTS = import.meta.env.VITE_ENABLE_IMAGE_ATTACHMENTS === "true";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
