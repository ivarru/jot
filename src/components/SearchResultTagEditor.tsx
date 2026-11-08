import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { DailyNoteSearchResult } from "~/domain/dailyNoteSearch";
import { findTaggableSearchPassage } from "~/domain/taggedNoteSearch";
import { tagSearchPassage } from "~/domain/tagSearchPassage";
import { normalizeJotTagName } from "~/domain/jotTags";

export function SearchResultTagEditor(props: {
  result: DailyNoteSearchResult;
  query: string;
  conditions: readonly string[];
  suggestions: readonly string[];
  loadSource: (result: DailyNoteSearchResult) => Promise<string>;
  save: (result: DailyNoteSearchResult, source: string, updated: string) => Promise<void>;
  onApplied: (source: string) => void;
  onClose: () => void;
}) {
  const [source, setSource] = createSignal<string | null>(null);
  const [text, setText] = createSignal("");
  const [input, setInput] = createSignal("");
  const [names, setNames] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let generation = 0;
  onCleanup(() => { generation++; });
  const load = async () => {
    const id = ++generation;
    setBusy(true); setError(null); setSource(null);
    try {
      const snapshot = await props.loadSource(props.result);
      if (id !== generation) return;
      const target = findTaggableSearchPassage(snapshot, props.query, props.conditions);
      if (!target) throw new Error("No matching paragraph or list item is available to tag.");
      setSource(snapshot); setText(target.text);
    } catch (cause) { if (id === generation) setError(cause instanceof Error ? cause.message : "Could not load passage."); }
    finally { if (id === generation) setBusy(false); }
  };
  onMount(() => void load());
  const add = () => {
    const name = normalizeJotTagName(input().replace(/^#/, ""));
    if (name) { setNames((values) => [...new Set([...values, name])]); setInput(""); }
  };
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const snapshot = source();
    if (snapshot === null || busy()) return;
    const id = generation;
    setBusy(true); setError(null);
    try {
      const updated = tagSearchPassage(snapshot, props.query, props.conditions, names());
      await props.save(props.result, snapshot, updated);
      if (id === generation) props.onApplied(updated);
    } catch (cause) {
      if (id === generation) {
        setError(cause instanceof Error ? cause.message : "Could not add tags.");
        setSource(null); // An explicit refresh is required before retrying a possibly stale target.
      }
    } finally { if (id === generation) setBusy(false); }
  };
  return <section aria-label={`Tag passage in ${props.result.date}`}>
    <p>Tags will be added to this matching passage:</p>
    <Show when={source() !== null}><blockquote class="search-tag-passage">{text()}</blockquote></Show>
    <Show when={busy()}><p role="status">Working…</p></Show>
    <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
    <form onSubmit={(event) => void submit(event)}>
      <label>Tag to add<input value={input()} list={`result-tags-${props.result.date}`} disabled={busy()}
        onInput={(event) => setInput(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && input().trim()) { event.preventDefault(); add(); } }} /></label>
      <datalist id={`result-tags-${props.result.date}`}><For each={props.suggestions}>{(name) => <option value={name} />}</For></datalist>
      <button type="button" disabled={busy() || !normalizeJotTagName(input().replace(/^#/, ""))} onClick={add}>Add tag</button>
      <div class="search-actions"><For each={names()}>{(name) => <button type="button" class="tag-chip" disabled={busy()}
        aria-label={`Remove tag ${name}`} onClick={() => setNames((values) => values.filter((value) => value !== name))}>#{name} ×</button>}</For></div>
      <div class="search-actions">
        <button type="submit" disabled={busy() || source() === null || !names().length}>Apply tags</button>
        <button type="button" disabled={busy()} onClick={() => void load()}>Refresh passage</button>
        <button type="button" disabled={busy()} onClick={props.onClose}>Cancel tagging</button>
      </div>
    </form>
  </section>;
}
