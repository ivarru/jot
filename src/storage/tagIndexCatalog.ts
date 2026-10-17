import { createMemo, createSignal, onCleanup } from "solid-js";
import { normalizeJotTagName } from "~/domain/jotTags";
import type { TagIndexSummary } from "./types";

const STORAGE_KEY = "jot.tagIndexCatalog.v1";

/** One shared, stale-while-refreshing catalog for tag browsing and insertion. */
export function createTagIndexCatalog(options: {
  storage?: Storage | null;
  list: () => Promise<readonly TagIndexSummary[]>;
}) {
  const validEntries = (value: unknown): TagIndexSummary[] => {
    if (!Array.isArray(value)) return [];
    const entries = new Map<string, TagIndexSummary>();
    for (const entry of value) {
      if (!entry || typeof entry.tag !== "string" || !entry.tag || normalizeJotTagName(entry.tag) !== entry.tag) continue;
      const modifiedTime = typeof entry.modifiedTime === "string" && Number.isFinite(Date.parse(entry.modifiedTime)) ? entry.modifiedTime : null;
      entries.set(entry.tag, { tag: entry.tag, modifiedTime });
    }
    return [...entries.values()];
  };
  let initial: TagIndexSummary[] = [];
  try { initial = validEntries(JSON.parse(options.storage?.getItem(STORAGE_KEY) ?? "[]")); } catch { /* Cache is optional. */ }
  const [entries, setEntries] = createSignal<readonly TagIndexSummary[]>(initial);
  const [alphabetical, setAlphabetical] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let generation = 0;
  const tags = createMemo(() => [...entries()].sort((a, b) => {
    const recent = alphabetical() ? 0 : (Date.parse(b.modifiedTime ?? "") || 0) - (Date.parse(a.modifiedTime ?? "") || 0);
    return recent || a.tag.localeCompare(b.tag);
  }).map((entry) => entry.tag), undefined, {
    // Metadata refreshes must not reset a keyboard selection in an unchanged list.
    equals: (previous, next) => previous.length === next.length && previous.every((tag, index) => tag === next[index])
  });
  onCleanup(() => { generation++; });
  const refresh = async () => {
    const request = ++generation;
    setRefreshing(true); setError(null);
    try {
      const result = validEntries(await options.list());
      if (request !== generation) return;
      setEntries(result);
      try { options.storage?.setItem(STORAGE_KEY, JSON.stringify(result)); } catch { /* Cache is optional. */ }
    } catch (cause) {
      if (request === generation) setError(cause instanceof Error ? cause.message : "Could not refresh tags. Please retry.");
    } finally { if (request === generation) setRefreshing(false); }
  };
  const clear = () => {
    generation++;
    setEntries([]); setRefreshing(false); setError(null); setAlphabetical(false);
    try {
      options.storage?.removeItem(STORAGE_KEY);
      options.storage?.removeItem("jot.tagSuggestions.v1");
    } catch { /* Sign-out must work without storage. */ }
  };
  return { tags, alphabetical, setAlphabetical, refreshing, error, refresh, clear };
}
