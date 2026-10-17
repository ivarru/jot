import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { parseTagIndexRows, tagIndexTarget, type TagIndexRow, type TagIndexTarget } from "~/domain/tagIndexNavigation";
import { TagIndexExcerpt } from "./TagIndexExcerpt";

export function TagIndexDialog(props: {
  readonly tags: readonly string[];
  readonly alphabetical: boolean;
  readonly onAlphabeticalChange: (value: boolean) => void;
  readonly refreshing: boolean;
  readonly listError: string | null;
  readonly onRefresh: () => Promise<void>;
  readonly loadIndex: (tag: string) => Promise<string>;
  readonly onSelect: (target: TagIndexTarget) => void;
  readonly onClose: (restoreFocus?: boolean) => void;
}) {
  let dialog!: HTMLDialogElement;
  let filterInput!: HTMLInputElement;
  let indexRequest = 0;
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal<string | null>(null);
  const [rows, setRows] = createSignal<readonly TagIndexRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [indexError, setIndexError] = createSignal<string | null>(null);
  const filteredTags = createMemo(() => props.tags.filter((tag) => tag.includes(filter().trim().toLowerCase().replace(/^#/, ""))));
  const load = async (tag: string) => {
    const request = ++indexRequest;
    setSelected(tag); setRows([]); setIndexError(null); setLoading(true);
    try {
      const content = await props.loadIndex(tag);
      if (request === indexRequest) setRows(parseTagIndexRows(content));
    } catch (cause) {
      if (request === indexRequest) setIndexError(cause instanceof Error ? cause.message : "Could not load this tag. Please retry.");
    } finally { if (request === indexRequest) setLoading(false); }
  };
  const close = (restoreFocus = true) => { indexRequest++; dialog.close?.(); props.onClose(restoreFocus); };
  onMount(() => { dialog.showModal?.(); filterInput.focus(); void props.onRefresh(); });
  onCleanup(() => { indexRequest++; });
  return <dialog ref={dialog} class="settings-dialog tag-index-dialog" aria-label="Browse tags" aria-modal="true"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header class="settings-panel-header">
      <h2>Browse tags</h2>
      <button type="button" class="icon-button" aria-label="Close tags" onClick={() => close()}>×</button>
    </header>
    <p class="tag-index-help">Occurrences from synced notes. Recent changes may take time to appear. Excerpt links do not navigate.</p>
    <div class="tag-index-filter">
      <label>Filter tags<input ref={filterInput} type="search" value={filter()} onInput={(event) => setFilter(event.currentTarget.value)} /></label>
      <button type="button" onClick={() => void props.onRefresh()} disabled={props.refreshing}>Refresh tags</button>
    </div>
    <label class="tag-order-toggle"><input type="checkbox" checked={props.alphabetical}
      onChange={(event) => props.onAlphabeticalChange(event.currentTarget.checked)} /> Alphabetical order</label>
    <Show when={props.refreshing}><p role="status">Refreshing tags…</p></Show>
    <Show when={props.listError}>{(error) => <p role="alert">{error()}</p>}</Show>
    <Show when={!props.refreshing && !props.listError && !props.tags.length}><p>No indexed tags yet. Add tags to a note and sync it, or rebuild the index in Settings.</p></Show>
    <Show when={props.tags.length > 0}>
      <div class="tag-index-layout">
        <nav class="tag-index-tags" aria-label="Indexed tags">
          <For each={filteredTags()}>{(tag) => <button type="button" aria-pressed={selected() === tag}
            onClick={() => void load(tag)}>#{tag}</button>}</For>
          <Show when={!filteredTags().length}><p>No tags match this filter.</p></Show>
        </nav>
        <section class="tag-index-results" aria-label="Tag occurrences" aria-busy={loading()}>
          <Show when={selected()} fallback={<p>Select a tag to see its occurrences.</p>}>{(tag) => <>
            <h3>#{tag()}</h3>
            <Show when={loading()}><p role="status">Loading occurrences…</p></Show>
            <Show when={indexError()}>{(error) => <div role="alert"><p>{error()}</p><button type="button" onClick={() => void load(tag())}>Retry occurrences</button></div>}</Show>
            <Show when={!loading() && !indexError()}>
              <Show when={rows().length} fallback={<p>No occurrences in this index. Refresh or rebuild the index in Settings.</p>}>
                <ol class="tag-index-rows"><For each={rows()}>{(row) => <li>
                  <button type="button" class="tag-index-occurrence" title="Open this tag occurrence"
                    onClick={() => { const target = tagIndexTarget(tag(), row, rows()); close(false); props.onSelect(target); }}>
                    <span class="tag-index-date"><time dateTime={row.date}>{row.date}</time><span class="tag-index-ordinal">Instance {row.ordinal + 1}</span></span>
                    <TagIndexExcerpt markdown={row.excerpt || "(No context)"} />
                  </button>
                </li>}</For></ol>
              </Show>
            </Show>
          </>}</Show>
        </section>
      </div>
    </Show>
  </dialog>;
}
