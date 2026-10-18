export const VIEWPORT_META_CONTENT =
  "width=device-width, initial-scale=1, minimum-scale=1, interactive-widget=resizes-content";

// Only production documents enforce this policy: development needs Vite's
// inline HMR bootstrap/websocket, which must not broaden the release policy.
export const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "script-src-attr 'none'",
  "connect-src 'self' https://www.googleapis.com https://photoslibrary.googleapis.com https://photospicker.googleapis.com https://*.googleusercontent.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com/revoke",
  // KaTeX and editor layout use style attributes; scripts remain non-inline.
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  // External note URLs still require per-view consent. CSP preserves ordinary
  // image URLs; the browser's mixed-content rules continue to apply to HTTP.
  "img-src 'self' data: blob: https: http:",
  // Vite embeds small KaTeX fonts as data URLs in the generated stylesheet.
  "font-src 'self' data:",
  "frame-src https://accounts.google.com/gsi/ https://accounts.google.com/o/oauth2/",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self' https://accounts.google.com/o/oauth2/ https://accounts.google.com/gsi/",
  "manifest-src 'self'",
  "worker-src 'self'"
].join("; ");

// Preserve the origin information GIS expects without sharing note URLs/queries
// with cross-origin resources. Individual image/open-link actions are stricter.
export const REFERRER_POLICY = "strict-origin-when-cross-origin";
