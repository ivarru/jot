import { createMemo, createSignal, onCleanup } from "solid-js";
import { normalizeJotTagName } from "~/domain/jotTags";
import type { TagIndexSummary } from "./types";

const STORAGE_KEY = "jot.tagIndexCatalog.v1";

/** One shared, stale-while-refreshing catalog for tag browsing and insertion. */
export function createTagIndexCatalog(options: {
  storage?: Storage | null;
  list: () => Promise<readonly TagIndexSummary[]>;
  listLocal?: () => Promise<readonly TagIndexSummary[]>;
}) {
  const validEntries = (value: unknown): TagIndexSummary[] => {
    if (!Array.isArray(value)) return [];
    const entries = new Map<string, TagIndexSummary>();
    for (const entry of value) {
      if (!entry || typeof entry.tag !== "string" || !entry.tag || normalizeJotTagName(entry.tag) !== entry.tag) continue;
      const modifiedTime = typeof entry.modifiedTime === "string" && Number.isFinite(Date.parse(entry.modifiedTime)) ? entry.modifiedTime : null;
      const previous = entries.get(entry.tag);
      if (!previous || (Date.parse(modifiedTime ?? "") || 0) > (Date.parse(previous.modifiedTime ?? "") || 0)) {
        entries.set(entry.tag, { tag: entry.tag, modifiedTime });
      }
    }
    return [...entries.values()];
  };
  let initial: TagIndexSummary[] = [];
  try { initial = validEntries(JSON.parse(options.storage?.getItem(STORAGE_KEY) ?? "[]")); } catch { /* Cache is optional. */ }
  const [entries, setEntries] = createSignal<readonly TagIndexSummary[]>(initial);
  const [localEntries, setLocalEntries] = createSignal<readonly TagIndexSummary[]>([]);
  const combinedEntries = createMemo(() => {
    const combined = new Map(entries().map(entry => [entry.tag, entry]));
    for (const entry of localEntries()) {
      // Index metadata remains authoritative once a synced index exists.
      if (!combined.has(entry.tag)) combined.set(entry.tag, entry);
    }
    return [...combined.values()];
  });
  const [alphabetical, setAlphabetical] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let generation = 0;
  const tags = createMemo(() => [...combinedEntries()].sort((a, b) => {
    const recent = alphabetical() ? 0 : (Date.parse(b.modifiedTime ?? "") || 0) - (Date.parse(a.modifiedTime ?? "") || 0);
    return recent || a.tag.localeCompare(b.tag);
  }).map((entry) => entry.tag), undefined, {
    // Metadata refreshes must not reset a keyboard selection in an unchanged list.
    equals: (previous, next) => previous.length === next.length && previous.every((tag, index) => tag === next[index])
  });
  const metadata = createMemo(() => new Map(combinedEntries().map((entry) => [entry.tag, entry.modifiedTime])));
  const modifiedTime = (tag: string) => metadata().get(tag) ?? null;
  onCleanup(() => { generation++; });
  const refresh = async () => {
    const request = ++generation;
    setRefreshing(true); setError(null);
    const remote = async () => {
      try {
        const result = validEntries(await options.list());
        if (request !== generation) return;
        setEntries(result);
        try { options.storage?.setItem(STORAGE_KEY, JSON.stringify(result)); } catch { /* Cache is optional. */ }
      } catch (cause) {
        if (request === generation) setError(cause instanceof Error ? cause.message : "Could not refresh tags. Please retry.");
      }
    };
    const local = async () => {
      if (!options.listLocal) return;
      try {
        const result = validEntries(await options.listLocal());
        if (request === generation) setLocalEntries(result);
      } catch (cause) {
        if (request === generation) setError(cause instanceof Error ? cause.message : "Could not refresh local tags. Please retry.");
      }
    };
    await Promise.all([remote(), local()]);
    if (request === generation) setRefreshing(false);
  };

  const clear = () => {
    generation++;
    setEntries([]); setLocalEntries([]); setRefreshing(false); setError(null); setAlphabetical(false);
    try {
      options.storage?.removeItem(STORAGE_KEY);
      options.storage?.removeItem("jot.tagSuggestions.v1");
    } catch { /* Sign-out must work without storage. */ }
  };
  return { tags, modifiedTime, hasIndex: (tag: string) => entries().some(entry => entry.tag === tag), alphabetical, setAlphabetical, refreshing, error, refresh, clear };
}
