import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";
import type { IsoDate } from "./dates";
import { containsDailyNoteConflictMarkers } from "./merge";
import { JOT_TAG_DESTINATION_PREFIX, normalizeJotTagName } from "./jotTags";

const markdown = remark().use(remarkGfm);
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

interface Node {
  type: string;
  children?: Node[];
  value?: string;
  url?: string;
  title?: string | null;
  identifier?: string;
  alt?: string | null;
  position?: { start: { offset?: number }; end: { offset?: number } };
}

export interface TagIndexOccurrence {
  readonly tag: string;
  readonly date: IsoDate;
  /** UTF-16 source offset; recompute against the current note before navigation. */
  readonly offset: number;
  readonly excerpt: string;
}

/** Derived from one explicit Markdown Snapshot, never from the selected editor date. */
export function extractTagIndexOccurrences(date: IsoDate, source: string, maxCharacters: number): TagIndexOccurrence[] {
  // Conflict wrappers are organizational markers, not excerpt prose. Preserve offsets for later navigation.
  const parsedSource = containsDailyNoteConflictMarkers(source)
    ? source.replace(/^(?:<<<<<<< Local Draft|=======|>>>>>>> Google Drive)$/gm, (line) => " ".repeat(line.length))
    : source;
  const root = markdown.parse(parsedSource) as unknown as Node;
  const definitions = new Map<string, Node>();
  const elements: Node[] = [];
  const occurrences: Array<{ node: Node; element: Node; paragraph: Node | undefined }> = [];
  const definitionKey = (value: string) => value.toUpperCase().replace(/\s+/g, " ");
  const walk = (node: Node, ancestors: Node[]) => {
    if (node.type === "definition" && node.identifier) definitions.set(definitionKey(node.identifier), node);
    const listItem = [...ancestors].reverse().find((parent) => parent.type === "listItem");
    if (node.type === "listItem" || node.type === "heading" || node.type === "tableCell"
      || node.type === "paragraph" && !listItem) elements.push(node);
    if (node.type === "link" || node.type === "linkReference") {
      const element = listItem ?? [...ancestors].reverse().find((parent) =>
        ["paragraph", "heading", "tableCell"].includes(parent.type));
      if (element) occurrences.push({ node, element, paragraph: [...ancestors].reverse().find((parent) => parent.type === "paragraph") });
    }
    for (const child of node.children ?? []) walk(child, [...ancestors, node]);
  };
  walk(root, []);
  const destination = (node: Node): string | undefined => node.type === "linkReference"
    ? definitions.get(definitionKey(node.identifier ?? ""))?.url : node.url;
  const tagName = (node: Node): string | null => {
    if (node.type !== "link" && node.type !== "linkReference") return null;
    const url = destination(node);
    if (!url?.startsWith(JOT_TAG_DESTINATION_PREFIX)) return null;
    const name = url.slice(JOT_TAG_DESTINATION_PREFIX.length);
    return normalizeJotTagName(name) === name ? name : null;
  };
  const inline = (node: Node, stop: number): Node[] => {
    if ((node.position?.start.offset ?? 0) >= stop || tagName(node)) return [];
    if (["code", "definition", "list"].includes(node.type)) return [];
    if (node.type === "text" || node.type === "inlineCode") return [{ type: node.type, value: node.value ?? "" }];
    if (node.type === "break") return [{ type: "text", value: " " }];
    if (node.type === "html") return [{ type: "text", value: node.value ?? "" }];
    if (node.type === "image" || node.type === "imageReference") return [{ type: "text", value: node.alt ?? "" }];
    const children = (node.children ?? []).flatMap((child) => inline(child, stop));
    if (["emphasis", "strong", "delete"].includes(node.type)) return [{ type: node.type, children }];
    if (node.type === "link" || node.type === "linkReference") {
      const url = destination(node);
      // Standalone fragments cannot depend on definitions elsewhere in the Daily Note.
      return url ? [{ type: "link", url: url.replace(/[\r\n]/g, "%0A"), title: null, children }] : children;
    }
    return [...children, ...(["paragraph", "heading", "tableCell"].includes(node.type) ? [{ type: "text", value: " " }] : [])];
  };
  return occurrences.flatMap(({ node, element, paragraph }) => {
    const tag = tagName(node);
    if (!tag) return [];
    const offset = node.position?.start.offset ?? 0;
    let context = inline(element, offset);
    // The existing Tags: declaration attaches to the preceding section heading.
    const declaration = paragraph && plainText(inline(paragraph, Infinity)).trim() === "Tags:";
    if (declaration) context = [];
    if (!plainText(context).trim()) {
      const previous = [...elements].reverse().find((candidate) =>
        (candidate.position?.end.offset ?? Infinity) <= ((declaration ? paragraph : element).position?.start.offset ?? 0)
        && plainText(inline(candidate, Infinity)).trim() && plainText(inline(candidate, Infinity)).trim() !== "Tags:");
      context = previous ? inline(previous, Infinity) : [];
    }
    return [{ tag, date, offset, excerpt: serializeExcerpt(context, maxCharacters) }];
  }).sort((a, b) => a.offset - b.offset);
}

function plainText(nodes: Node[]): string {
  return nodes.map((node) => node.value ?? plainText(node.children ?? [])).join("");
}

function serializeExcerpt(nodes: Node[], maxCharacters: number): string {
  let previousSpace = true;
  const normalize = (node: Node): Node => {
    if (node.value !== undefined) {
      let value = node.value.replace(/\s+/g, " ");
      if (previousSpace) value = value.replace(/^ /, "");
      if (value) previousSpace = value.endsWith(" ");
      return { ...node, value };
    }
    return { ...node, children: (node.children ?? []).map(normalize) };
  };
  const normalized = nodes.map(normalize);
  const text = plainText(normalized).trimEnd();
  const characters = Array.from(segmenter.segment(text));
  const limit = Math.max(1, Math.floor(maxCharacters));
  const clipped = characters.length > limit;
  // The ellipsis counts toward the visible-character limit, closing Markdown syntax does not.
  let remaining = clipped ? characters[Math.max(0, limit - 1)]!.index : text.length;
  const truncate = (node: Node): Node[] => {
    if (remaining <= 0) return [];
    if (node.value !== undefined) {
      const value = node.value.slice(0, remaining);
      remaining -= value.length;
      return value ? [{ ...node, value }] : [];
    }
    const children = (node.children ?? []).flatMap(truncate);
    return children.length ? [{ ...node, children }] : [];
  };
  const children = normalized.flatMap(truncate);
  if (clipped) children.push({ type: "text", value: "…" });
  if (!children.length) return "";
  return markdown.stringify({ type: "root", children: [{ type: "paragraph", children }] } as unknown as Root).trim();
}

/** Line order also identifies a tag's ordinal occurrence within each date, including equal excerpts. */
export function buildTagIndexFiles(notes: readonly { date: IsoDate; markdown: string }[], maxCharacters: number): Map<string, string> {
  const entries = notes.flatMap((note) => extractTagIndexOccurrences(note.date, note.markdown, maxCharacters))
    .sort((a, b) => a.date.localeCompare(b.date) || a.offset - b.offset);
  const files = new Map<string, string>();
  for (const entry of entries) {
    files.set(entry.tag, (files.get(entry.tag) ?? "") + `${entry.date}${entry.excerpt ? ` ${entry.excerpt}` : ""}  \n`);
  }
  return files;
}
