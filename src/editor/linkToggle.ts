export interface LinkToggleResult {
  readonly markdown: string;
  readonly cursorOffset: number;
}

interface LinkMatch {
  readonly type: "simple" | "full";
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly url: string;
}

const SIMPLE_LINK_PATTERN = /<([^<>\s]+)>/g;
const FULL_LINK_START_PATTERN = /\[((?:\\[\\[\]]|[^\]\\\n])*)\]\(/g;
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

export function toggleLinkAtCursor(markdown: string, cursorOffset: number): LinkToggleResult | null {
  const offset = clampOffset(markdown, cursorOffset);
  const full = fullLinkAtCursor(markdown, offset);
  if (full !== null) return fullLinkToSimple(markdown, full);

  const simple = linkAtCursor(markdown, offset, SIMPLE_LINK_PATTERN, "simple");
  if (simple !== null) return simpleLinkToFull(markdown, simple);

  return null;
}

function fullLinkToSimple(markdown: string, match: LinkMatch): LinkToggleResult {
  const replacement = `<${match.url}>`;
  return {
    markdown: replaceRange(markdown, match.start, match.end, replacement),
    cursorOffset: match.start + replacement.length - 1
  };
}

function simpleLinkToFull(markdown: string, match: LinkMatch): LinkToggleResult {
  const text = slugText(match.url);
  const escapedText = escapeLinkLabel(text);
  const replacement = `[${escapedText}](<${match.url}>)`;
  return {
    markdown: replaceRange(markdown, match.start, match.end, replacement),
    cursorOffset: match.start + escapedText.length + 1
  };
}

function fullLinkAtCursor(markdown: string, offset: number): LinkMatch | null {
  FULL_LINK_START_PATTERN.lastIndex = 0;

  for (const match of markdown.matchAll(FULL_LINK_START_PATTERN)) {
    const start = match.index ?? 0;
    const destinationStart = start + (match[0]?.length ?? 0);
    const destination = readLinkDestination(markdown, destinationStart);
    if (destination === null) continue;

    if (offset < start || offset > destination.end) continue;
    if (!URL_PATTERN.test(destination.url)) continue;

    return {
      type: "full",
      start,
      end: destination.end,
      text: match[1] ?? "",
      url: destination.url
    };
  }

  return null;
}

function readLinkDestination(markdown: string, start: number): { readonly url: string; readonly end: number } | null {
  if (markdown[start] === "<") {
    return readAngleLinkDestination(markdown, start);
  }

  let depth = 0;
  for (let index = start; index < markdown.length; index += 1) {
    const character = markdown[index] ?? "";
    if (character === "\\" && index + 1 < markdown.length) {
      index += 1;
      continue;
    }

    if (character === "\n" || /\s/.test(character)) return null;
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      if (depth === 0) {
        const url = markdown.slice(start, index);
        return url.length > 0 ? { url, end: index + 1 } : null;
      }
      depth -= 1;
    }
  }

  return null;
}

function readAngleLinkDestination(markdown: string, start: number): { readonly url: string; readonly end: number } | null {
  for (let index = start + 1; index < markdown.length; index += 1) {
    const character = markdown[index] ?? "";
    if (character === "\\" && index + 1 < markdown.length) {
      index += 1;
      continue;
    }
    if (character === "\n") return null;
    if (character !== ">") continue;

    const url = markdown.slice(start + 1, index);
    const closingParen = index + 1;
    if (url.length === 0 || markdown[closingParen] !== ")") return null;
    return { url, end: closingParen + 1 };
  }

  return null;
}

function linkAtCursor(
  markdown: string,
  offset: number,
  pattern: RegExp,
  type: LinkMatch["type"]
): LinkMatch | null {
  pattern.lastIndex = 0;

  for (const match of markdown.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0] ?? "";
    const end = start + raw.length;
    if (offset < start || offset > end) continue;

    const url = type === "simple" ? match[1] : match[2];
    if (typeof url !== "string" || !URL_PATTERN.test(url)) continue;

    return {
      type,
      start,
      end,
      text: type === "full" ? match[1] ?? "" : "",
      url
    };
  }

  return null;
}

function slugText(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter((part) => part.length > 0);
    const slug = pathParts.at(-1) ?? parsed.hostname;
    return decodeUriComponentOrRaw(slug);
  } catch {
    const withoutFragment = url.split("#", 1)[0] ?? url;
    const withoutQuery = withoutFragment.split("?", 1)[0] ?? withoutFragment;
    const parts = withoutQuery.split("/").filter((part) => part.length > 0);
    return decodeUriComponentOrRaw(parts.at(-1) ?? url);
  }
}

function decodeUriComponentOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function replaceRange(markdown: string, start: number, end: number, replacement: string): string {
  return `${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`;
}

function escapeLinkLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

function clampOffset(markdown: string, offset: number): number {
  return Math.max(0, Math.min(markdown.length, offset));
}
