import type {
  Code,
  Delete,
  Emphasis,
  Heading,
  Image,
  InlineCode,
  Link,
  LinkReference,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Text
} from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { parseIsoDate, type IsoDate } from "./dates";
import type { MarkdownSelection } from "~/editor/markdownSelection";

export interface DailyNoteHeading {
  readonly depth: number;
  readonly text: string;
  readonly slug: string;
  readonly selection: MarkdownSelection;
}

export interface DailyNoteLinkTarget {
  readonly date: IsoDate;
  readonly headingSlug: string | null;
}

export interface MarkdownLinkAtOffset {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly destination: string;
}

const markdownParser = remark().use(remarkGfm);
const FULL_LINK_START_PATTERN = /\[((?:\\[\\[\]]|[^\]\\\n])*)\]\(/g;
const SIMPLE_LINK_PATTERN = /<([^<>\s]+)>/g;
const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const DEFAULT_APP_LINK_ORIGIN = "https://jot.local";

export function extractDailyNoteHeadings(markdown: string): readonly DailyNoteHeading[] {
  const slugCounts = new Map<string, number>();
  const headings: DailyNoteHeading[] = [];
  const root = markdownParser.parse(markdown) as Root;

  for (const node of root.children) {
    if (node.type !== "heading") continue;

    const text = headingText(node);
    if (text.trim().length === 0) continue;

    const slugBase = headingSlugBase(text);
    const count = slugCounts.get(slugBase) ?? 0;
    slugCounts.set(slugBase, count + 1);
    const slug = count === 0 ? slugBase : `${slugBase}-${count}`;
    headings.push({
      depth: node.depth,
      text,
      slug,
      selection: headingTextSelection(markdown, node)
    });
  }

  return headings;
}

export function dailyNoteSectionHref(date: IsoDate, headingSlug: string): string {
  return `#/date/${date}#${encodeURIComponent(headingSlug)}`;
}

export function dailyNoteRelativeSectionHref(headingSlug: string): string {
  return `#${encodeURIComponent(headingSlug)}`;
}

export function dailyNoteSectionLinkHref(sourceDate: IsoDate, targetDate: IsoDate, headingSlug: string): string {
  return sourceDate === targetDate ? dailyNoteRelativeSectionHref(headingSlug) : dailyNoteSectionHref(targetDate, headingSlug);
}

export function dailyNoteDateHref(date: IsoDate): string {
  return `#/date/${date}`;
}

export function parseDailyNoteLinkTarget(
  href: string,
  currentDate: IsoDate | null = null,
  appOrigin = DEFAULT_APP_LINK_ORIGIN
): DailyNoteLinkTarget | null {
  if (currentDate !== null && relativeHeadingHref(href)) {
    return {
      date: currentDate,
      headingSlug: decodeURIComponentOrRaw(href.slice(1))
    };
  }

  const hash = hrefHash(href, appOrigin);
  const match = /^#\/date\/([^/#]+)(?:#(.+))?$/.exec(hash);
  if (!match) return null;

  const date = parseIsoDate(match[1] ?? "");
  if (date === null) return null;

  return {
    date,
    headingSlug: match[2] === undefined ? null : decodeURIComponentOrRaw(match[2])
  };
}

export function findDailyNoteHeadingBySlug(markdown: string, slug: string): DailyNoteHeading | null {
  return extractDailyNoteHeadings(markdown).find((heading) => heading.slug === slug) ?? null;
}

export function insertMarkdownLinkAtSelection(
  markdown: string,
  selection: MarkdownSelection,
  fallbackLabel: string,
  destination: string
): { readonly markdown: string; readonly selection: MarkdownSelection } {
  const start = Math.max(0, Math.min(markdown.length, Math.min(selection.start, selection.end)));
  const end = Math.max(0, Math.min(markdown.length, Math.max(selection.start, selection.end)));
  const selectedText = markdown.slice(start, end);
  const label = selectedText.length > 0 && !selectedText.includes("\n") ? selectedText : fallbackLabel;
  const replacement = `[${escapeMarkdownLinkLabel(label)}](${destination})`;
  const nextSelection = {
    start: start + 1,
    end: start + 1 + escapeMarkdownLinkLabel(label).length
  };

  return {
    markdown: `${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`,
    selection: nextSelection
  };
}

export function selectionOverlapsMarkdownLinkOrCode(markdown: string, selection: MarkdownSelection): boolean {
  const selectedRange = normalizedSelection(markdown, selection);
  const root = markdownParser.parse(markdown) as Root;
  let found = false;

  const visit = (node: RootContent | PhrasingContent) => {
    if (isLinkOrCodeNode(node) && positionedNodeOverlapsSelection(node, selectedRange)) {
      found = true;
      return;
    }

    if (!("children" in node) || !Array.isArray(node.children)) return;
    for (const child of node.children) {
      if (found) return;
      visit(child);
    }
  };

  for (const node of root.children) {
    if (found) break;
    visit(node);
  }

  return found;
}

export function markdownLinkAtOffset(markdown: string, cursorOffset: number): MarkdownLinkAtOffset | null {
  const offset = Math.max(0, Math.min(markdown.length, cursorOffset));
  const full = fullMarkdownLinkAtOffset(markdown, offset);
  if (full !== null) return full;

  SIMPLE_LINK_PATTERN.lastIndex = 0;
  for (const match of markdown.matchAll(SIMPLE_LINK_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0] ?? "";
    const end = start + raw.length;
    if (offset < start || offset > end) continue;
    const destination = match[1] ?? "";
    if (!isSafeExternalHref(destination)) continue;
    return {
      start,
      end,
      label: destination,
      destination
    };
  }

  return null;
}

function normalizedSelection(markdown: string, selection: MarkdownSelection): MarkdownSelection {
  const start = Math.max(0, Math.min(markdown.length, Math.min(selection.start, selection.end)));
  const end = Math.max(0, Math.min(markdown.length, Math.max(selection.start, selection.end)));
  return { start, end };
}

type LinkOrCodeNode = Code | InlineCode | Link | LinkReference;

function isLinkOrCodeNode(node: RootContent | PhrasingContent): node is LinkOrCodeNode {
  return node.type === "code" || node.type === "inlineCode" || node.type === "link" || node.type === "linkReference";
}

function positionedNodeOverlapsSelection(node: LinkOrCodeNode, selection: MarkdownSelection): boolean {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (typeof start !== "number" || typeof end !== "number") return false;

  if (selection.start === selection.end) {
    return selection.start > start && selection.start < end;
  }

  return selection.start < end && selection.end > start;
}

export function isSafeExternalHref(href: string, appOrigin = DEFAULT_APP_LINK_ORIGIN): boolean {
  if (parseDailyNoteLinkTarget(href, null, appOrigin) !== null) return false;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(href, "https://jot.local/").protocol);
  } catch {
    return false;
  }
}

function relativeHeadingHref(href: string): boolean {
  return href.startsWith("#") && !href.startsWith("#/") && href.length > 1;
}

function fullMarkdownLinkAtOffset(markdown: string, offset: number): MarkdownLinkAtOffset | null {
  FULL_LINK_START_PATTERN.lastIndex = 0;

  for (const match of markdown.matchAll(FULL_LINK_START_PATTERN)) {
    const start = match.index ?? 0;
    const destinationStart = start + (match[0]?.length ?? 0);
    const destination = readLinkDestination(markdown, destinationStart);
    if (destination === null) continue;
    if (offset < start || offset > destination.end) continue;

    return {
      start,
      end: destination.end,
      label: unescapeMarkdownLinkLabel(match[1] ?? ""),
      destination: destination.url
    };
  }

  return null;
}

function readLinkDestination(markdown: string, start: number): { readonly url: string; readonly end: number } | null {
  if (markdown[start] === "<") return readAngleLinkDestination(markdown, start);

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

function headingText(node: Heading): string {
  return phrasingText(node.children).trim();
}

function phrasingText(nodes: readonly PhrasingContent[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return node.value;
      case "inlineCode":
        return node.value;
      case "image":
        return node.alt ?? "";
      case "break":
        return " ";
      case "emphasis":
      case "strong":
      case "delete":
      case "link":
      case "linkReference":
        return phrasingText(node.children ?? []);
      default:
        return "";
    }
  }).join("");
}

function headingTextSelection(markdown: string, node: Heading): MarkdownSelection {
  const textRange = phrasingRange(node.children);
  if (textRange !== null) return textRange;

  const start = node.position?.start.offset ?? 0;
  const end = node.position?.end.offset ?? start;
  return {
    start: Math.max(0, Math.min(markdown.length, start)),
    end: Math.max(0, Math.min(markdown.length, end))
  };
}

type PositionedPhrasing = Text | InlineCode | Image | Emphasis | Strong | Delete | Link | LinkReference;

function phrasingRange(nodes: readonly PhrasingContent[]): MarkdownSelection | null {
  let start: number | null = null;
  let end: number | null = null;

  const visit = (node: PhrasingContent) => {
    if (isPositionedPhrasing(node)) {
      const nodeStart = node.position?.start.offset;
      const nodeEnd = node.position?.end.offset;
      if (typeof nodeStart === "number") start = start === null ? nodeStart : Math.min(start, nodeStart);
      if (typeof nodeEnd === "number") end = end === null ? nodeEnd : Math.max(end, nodeEnd);
    }

    if (
      node.type === "emphasis" ||
      node.type === "strong" ||
      node.type === "delete" ||
      node.type === "link" ||
      node.type === "linkReference"
    ) {
      for (const child of node.children ?? []) visit(child);
    }
  };

  for (const node of nodes) visit(node);
  return start === null || end === null ? null : { start, end };
}

function isPositionedPhrasing(node: PhrasingContent): node is PositionedPhrasing {
  return (
    node.type === "text" ||
    node.type === "inlineCode" ||
    node.type === "image" ||
    node.type === "emphasis" ||
    node.type === "strong" ||
    node.type === "delete" ||
    node.type === "link" ||
    node.type === "linkReference"
  );
}

function headingSlugBase(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "section";
}

function hrefHash(href: string, appOrigin: string): string {
  if (href.startsWith("#")) return href;
  try {
    const baseUrl = new URL(appOrigin);
    const url = new URL(href, baseUrl);
    return url.origin === baseUrl.origin ? url.hash : "";
  } catch {
    return "";
  }
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

function unescapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\\([\\[\]])/g, "$1");
}

function decodeURIComponentOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
