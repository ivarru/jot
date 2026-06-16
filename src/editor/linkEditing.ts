import { markdownLinkAtOffset, type MarkdownLinkAtOffset } from "~/domain/dailyNoteLinks";
import type { MarkdownSelection } from "./markdownSelection";

export interface ClipboardLinkData {
  readonly url: string;
  readonly text: string | null;
}

export interface ClipboardLinkSuggestion {
  readonly url: string | null;
  readonly text: string | null;
}

export type LinkEditTarget =
  | {
      readonly kind: "existing-link";
      readonly start: number;
      readonly end: number;
      readonly text: string;
      readonly url: string;
    }
  | {
      readonly kind: "raw-url";
      readonly start: number;
      readonly end: number;
      readonly text: string;
      readonly url: string;
    }
  | {
      readonly kind: "selection";
      readonly start: number;
      readonly end: number;
      readonly text: string;
      readonly url: string;
    };

export interface LinkEditDraft {
  readonly target: LinkEditTarget;
  readonly text: string;
  readonly url: string;
  readonly clipboardLink: ClipboardLinkData | null;
}

export interface LinkEditResult {
  readonly markdown: string;
  readonly selection: MarkdownSelection;
}

const RAW_URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s<>\[\]]+/gi;
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function createLinkEditDraft(
  markdown: string,
  selection: MarkdownSelection,
  clipboardLink: ClipboardLinkData | null = null
): LinkEditDraft {
  const target = linkEditTargetAtSelection(markdown, selection);
  if (target.kind === "existing-link") {
    return {
      target,
      text: target.text,
      url: target.url,
      clipboardLink
    };
  }

  if (target.kind === "raw-url") {
    return {
      target,
      text: target.text,
      url: target.url,
      clipboardLink
    };
  }

  const clipboardUrl = clipboardLink?.url ?? "";
  const selectedText = target.text;
  const text = selectedText.length > 0
    ? selectedText
    : clipboardLink?.text ?? (clipboardUrl.length > 0 ? suggestedLinkText(clipboardUrl) : "");

  return {
    target,
    text,
    url: clipboardUrl,
    clipboardLink
  };
}

export function applyLinkEdit(
  markdown: string,
  target: LinkEditTarget,
  text: string,
  url: string
): LinkEditResult | null {
  const normalizedUrl = url.trim();
  if (!isSupportedLinkDestination(normalizedUrl)) return null;

  const label = text.trim().length > 0 ? text.trim() : suggestedLinkText(normalizedUrl);
  const escapedLabel = escapeMarkdownLinkLabel(label);
  const replacement = `[${escapedLabel}](${markdownLinkDestination(normalizedUrl)})`;
  const nextMarkdown = `${markdown.slice(0, target.start)}${replacement}${markdown.slice(target.end)}`;

  return {
    markdown: nextMarkdown,
    selection: {
      start: target.start + 1,
      end: target.start + 1 + escapedLabel.length
    }
  };
}

export function linkEditTargetAtSelection(markdown: string, selection: MarkdownSelection): LinkEditTarget {
  const normalized = normalizedSelection(markdown, selection);
  const existing = markdownLinkAtSelection(markdown, normalized);
  if (existing !== null) {
    const source = markdown.slice(existing.start, existing.end);
    return {
      kind: "existing-link",
      start: existing.start,
      end: existing.end,
      text: source.startsWith("<") ? suggestedLinkText(existing.destination) : existing.label,
      url: existing.destination
    };
  }

  const rawUrl = rawUrlAtSelection(markdown, normalized);
  if (rawUrl !== null) {
    return {
      kind: "raw-url",
      start: rawUrl.start,
      end: rawUrl.end,
      text: suggestedLinkText(rawUrl.url),
      url: rawUrl.url
    };
  }

  return {
    kind: "selection",
    start: normalized.start,
    end: normalized.end,
    text: singleLineText(markdown.slice(normalized.start, normalized.end)),
    url: ""
  };
}

export function parseClipboardLinkData(input: {
  readonly text: string;
  readonly html: string;
}): ClipboardLinkData | null {
  const suggestion = parseClipboardLinkSuggestion(input);
  if (suggestion === null || suggestion.url === null) return null;
  return {
    url: suggestion.url,
    text: suggestion.text
  };
}

export function parseClipboardLinkSuggestion(input: {
  readonly text: string;
  readonly html: string;
}): ClipboardLinkSuggestion | null {
  const htmlLink = firstHtmlAnchorLink(input.html);
  if (htmlLink !== null) return htmlLink;

  const text = input.text.trim();
  if (text.length === 0) return null;

  const url = plainUrl(text);
  if (url !== null) return { url, text: null };

  const rawUrl = firstRawUrl(text);
  if (rawUrl !== null) {
    const textWithoutUrl = textWithoutRawUrl(text, rawUrl);
    return {
      url: rawUrl.url,
      text: textWithoutUrl.length > 0 ? textWithoutUrl : null
    };
  }

  const label = singleLineText(text);
  return label.length > 0 ? { url: null, text: label } : null;
}

export function parseShareTargetLinkData(params: URLSearchParams): ClipboardLinkData | null {
  const title = nonEmpty(params.get("title"));
  const text = nonEmpty(params.get("text"));
  const explicitUrl = nonEmpty(params.get("url"));
  const rawUrl = text === null ? null : firstRawUrl(text);
  const url = explicitUrl !== null ? plainUrl(explicitUrl) : rawUrl?.url ?? null;
  if (url === null) return null;

  const textWithoutUrl = text === null
    ? null
    : rawUrl !== null && rawUrl.url === url
      ? textWithoutRawUrl(text, rawUrl)
      : singleLineText(text.replace(url, "").trim());
  const label = title ?? (textWithoutUrl !== null && textWithoutUrl.length > 0 ? textWithoutUrl : null);
  return {
    url,
    text: label
  };
}

export function suggestedLinkText(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter((part) => part.length > 0);
    const slug = pathParts.at(-1);
    const text = slug === undefined ? parsed.hostname : decodeURIComponentOrRaw(slug);
    return parsed.hostname.length === 0 || text === parsed.hostname ? text : `${text} (${parsed.hostname})`;
  } catch {
    const raw = firstRawUrl(url)?.url ?? url;
    const parts = raw.split(/[/?#]/).filter((part) => part.length > 0);
    return decodeURIComponentOrRaw(parts.at(-1) ?? raw);
  }
}

export function isSupportedLinkDestination(value: string): boolean {
  if (value.startsWith("#") && value.length > 1) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;

  try {
    return SAFE_PROTOCOLS.has(new URL(value, "https://jot.local/").protocol);
  } catch {
    return false;
  }
}

function markdownLinkAtSelection(markdown: string, selection: MarkdownSelection): MarkdownLinkAtOffset | null {
  const startLink = markdownLinkAtOffset(markdown, selection.start);
  if (startLink === null) return null;
  if (selection.start === selection.end) return startLink;

  const endLink = markdownLinkAtOffset(markdown, Math.max(selection.start, selection.end - 1));
  if (endLink === null) return null;
  return startLink.start === endLink.start && startLink.end === endLink.end ? startLink : null;
}

function rawUrlAtSelection(
  markdown: string,
  selection: MarkdownSelection
): { readonly start: number; readonly end: number; readonly url: string } | null {
  const startRawUrl = rawUrlAtOffset(markdown, selection.start);
  if (startRawUrl === null) return null;
  if (selection.start === selection.end) return startRawUrl;

  const endRawUrl = rawUrlAtOffset(markdown, Math.max(selection.start, selection.end - 1));
  if (endRawUrl === null) return null;
  return startRawUrl.start === endRawUrl.start && startRawUrl.end === endRawUrl.end ? startRawUrl : null;
}

function rawUrlAtOffset(
  markdown: string,
  offset: number
): { readonly start: number; readonly end: number; readonly url: string } | null {
  RAW_URL_PATTERN.lastIndex = 0;
  for (const match of markdown.matchAll(RAW_URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = trimTrailingUrlPunctuation(match[0] ?? "");
    const end = start + raw.length;
    if (offset < start || offset > end) continue;
    if (!isSupportedLinkDestination(raw)) continue;
    return { start, end, url: raw };
  }

  return null;
}

function firstRawUrl(text: string): {
  readonly start: number;
  readonly end: number;
  readonly sourceEnd: number;
  readonly url: string;
} | null {
  RAW_URL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(RAW_URL_PATTERN)) {
    const source = match[0] ?? "";
    const raw = trimTrailingUrlPunctuation(source);
    if (isSupportedLinkDestination(raw)) {
      const start = match.index ?? 0;
      return { start, end: start + raw.length, sourceEnd: start + source.length, url: raw };
    }
  }
  return null;
}

function textWithoutRawUrl(text: string, rawUrl: {
  readonly start: number;
  readonly sourceEnd: number;
}): string {
  return singleLineText(`${text.slice(0, rawUrl.start)}${text.slice(rawUrl.sourceEnd)}`.trim());
}

function plainUrl(text: string): string | null {
  const raw = trimTrailingUrlPunctuation(text);
  return raw.length === text.length && isSupportedLinkDestination(raw) ? raw : null;
}

function firstHtmlAnchorLink(html: string): ClipboardLinkData | null {
  if (html.trim().length === 0 || typeof DOMParser === "undefined") return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchor = doc.querySelector("a[href]");
  const href = anchor?.getAttribute("href")?.trim() ?? "";
  if (!isSupportedLinkDestination(href)) return null;

  const text = singleLineText(anchor?.textContent?.trim() ?? "");
  return {
    url: href,
    text: text.length > 0 ? text : null
  };
}

function markdownLinkDestination(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/[<>\n]/.test(url)) return `<${url}>`;
  return url;
}

function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(/[.,;!?]+$/u, "");
}

function normalizedSelection(markdown: string, selection: MarkdownSelection): MarkdownSelection {
  const start = Math.max(0, Math.min(markdown.length, Math.min(selection.start, selection.end)));
  const end = Math.max(0, Math.min(markdown.length, Math.max(selection.start, selection.end)));
  return { start, end };
}

function singleLineText(text: string): string {
  return text.includes("\n") ? "" : text.trim();
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

function decodeURIComponentOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
