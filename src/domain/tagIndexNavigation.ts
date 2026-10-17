import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { parseIsoDate, type IsoDate } from "./dates";
import { extractTagIndexOccurrences } from "./tagIndex";
import type { MarkdownSelection } from "~/editor/markdownSelection";

export interface TagIndexRow { readonly date: IsoDate; readonly excerpt: string; readonly ordinal: number }
export interface TagIndexTarget {
  readonly tag: string;
  readonly date: IsoDate;
  readonly ordinal: number;
  readonly excerpts: readonly string[];
}
const parser = remark().use(remarkGfm);
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function parseTagIndexRows(markdown: string): TagIndexRow[] {
  const lines = markdown.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line) => {
    const match = /^(\d{4}-\d{2}-\d{2})(?: (.*))?$/.exec(line.trimEnd());
    const date = match ? parseIsoDate(match[1]!) : null;
    if (!match || !date) throw new Error("This tag index could not be read. Rebuild it in Settings, then retry.");
    return { date, excerpt: (match[2] ?? "").trimEnd() };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const counts = new Map<IsoDate, number>();
  return rows.map((row) => {
    const ordinal = counts.get(row.date) ?? 0;
    counts.set(row.date, ordinal + 1);
    return { ...row, ordinal };
  });
}

export function tagIndexTarget(tag: string, row: TagIndexRow, rows: readonly TagIndexRow[]): TagIndexTarget {
  return { tag, date: row.date, ordinal: row.ordinal, excerpts: rows.filter((item) => item.date === row.date).map((item) => item.excerpt) };
}

function visibleText(markdown: string): string {
  const text = (node: { value?: string; children?: unknown[] }): string => node.value ?? (node.children ?? []).map((child) => text(child as typeof node)).join("");
  return text(parser.parse(markdown) as unknown as Parameters<typeof text>[0]).replace(/\s+/g, " ").trim();
}

export function resolveTagIndexTarget(source: string, target: TagIndexTarget):
  { readonly status: "found"; readonly selection: MarkdownSelection } | { readonly status: "missing" | "ambiguous" } {
  const cache = new Map<number, ReturnType<typeof extractTagIndexOccurrences>>();
  const occurrences = (limit: number) => {
    if (!cache.has(limit)) cache.set(limit, extractTagIndexOccurrences(target.date, source, limit).filter((entry) => entry.tag === target.tag));
    return cache.get(limit)!;
  };
  const current = occurrences(2000);
  if (!current.length || target.excerpts[target.ordinal] === undefined) return { status: "missing" };
  const matches = (excerpt: string, index: number) => {
    const expected = visibleText(excerpt);
    const limit = excerpt.endsWith("…") ? Array.from(segmenter.segment(expected)).length : 2000;
    const actual = occurrences(Math.max(1, limit))[index];
    return actual !== undefined && visibleText(actual.excerpt) === expected;
  };
  const sequenceMatches = current.length === target.excerpts.length && target.excerpts.every(matches);
  let index = target.ordinal;
  if (!sequenceMatches) {
    const expected = target.excerpts[target.ordinal]!;
    const candidates = current.flatMap((_, i) => matches(expected, i) ? [i] : []);
    // An identical indexed sibling might have been removed. Do not guess which occurrence survived.
    const indexedDuplicates = target.excerpts.filter((excerpt) => visibleText(excerpt) === visibleText(expected)).length;
    if (candidates.length > 1 || indexedDuplicates > 1 && candidates.length) return { status: "ambiguous" };
    if (!candidates.length) return { status: "missing" };
    index = candidates[0]!;
  }
  const hit = current[index]!;
  return { status: "found", selection: { start: hit.offset, end: hit.endOffset } };
}
