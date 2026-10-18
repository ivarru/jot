import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { newestTagIndexRows, parseTagIndexRows, tagIndexTarget, type TagIndexRow, type TagIndexTarget } from "~/domain/tagIndexNavigation";
import { completeJotTagPrefix, filterJotTagSuggestions, normalizeJotTagName } from "~/domain/jotTags";
import { formatSearchModifiedTime } from "~/domain/dailyNoteSearch";
import { isEscapeKey } from "./keyboard";
import { preserveDialogFullscreen } from "./dialogFullscreen";
import { TagIndexExcerpt } from "./TagIndexExcerpt";

export interface TagDialogProps {
  readonly tags: readonly string[];
  readonly modifiedTime?: (tag: string) => string | null;
  readonly hasIndex?: (tag: string) => boolean;
  readonly alphabetical: boolean;
  readonly onAlphabeticalChange: (value: boolean) => void;
  readonly refreshing: boolean;
  readonly listError: string | null;
  readonly onRefresh: () => Promise<void>;
  readonly loadIndex: (tag: string) => Promise<string>;
  readonly insertionUnavailable: string | null;
  readonly addError: string | null;
  readonly onAdd: (tag: string) => void;
  readonly onSelect: (target: TagIndexTarget) => void;
  readonly onClose: (restoreFocus?: boolean) => void;
}

export function TagIndexDialog(props: TagDialogProps) {
  let dialog!: HTMLDialogElement;
  let input!: HTMLInputElement;
  const [query, setQuery] = createSignal("");
  const [activeTag, setActiveTag] = createSignal<string | null>(null);
  const matches = createMemo(() => filterJotTagSuggestions(props.tags, query()));
  const normalized = createMemo(() => normalizeJotTagName(query()));
  const canAdd = () => props.insertionUnavailable === null;
  const addButtons = new Map<string, HTMLButtonElement>();
  const close = (restoreFocus = true) => { dialog.close?.(); props.onClose(restoreFocus); };
  createEffect(() => { if (activeTag() !== null && !matches().includes(activeTag()!)) setActiveTag(null); });
  const add = (tag: string | null) => { if (canAdd() && tag) props.onAdd(tag); };
  const fieldKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const completed = completeJotTagPrefix(props.tags, query());
      if (completed !== null) { event.preventDefault(); setQuery(completed); setActiveTag(null); }
    } else if (event.key === "Enter") {
      event.preventDefault(); add(activeTag() ?? normalized());
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!canAdd()) return;
      const index = activeTag() === null ? -1 : matches().indexOf(activeTag()!);
      const next = event.key === "ArrowDown" ? Math.min(index + 1, matches().length - 1) : Math.max(-1, index - 1);
      const tag = next < 0 ? null : matches()[next] ?? null;
      setActiveTag(tag);
      (tag === null ? dialog.querySelector<HTMLButtonElement>(".tag-field-add") : addButtons.get(tag))?.scrollIntoView?.({ block: "nearest" });
    }
  };
  onMount(() => {
    dialog.showModal?.(); input.focus(); void props.onRefresh();
    const releaseFullscreen = preserveDialogFullscreen();
    onCleanup(releaseFullscreen);
  });
  return <dialog ref={dialog} class="settings-dialog tag-index-dialog tag-modal" role="dialog" aria-label="Tags" aria-modal="true"
    onKeyDown={(event) => {
      if (!isEscapeKey(event)) return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    }}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}>
    <header class="settings-panel-header">
      <h2>Tags<Show when={props.refreshing}><span role="status"> (refreshing…)</span></Show></h2>
      <button type="button" class="icon-button" aria-label="Close tags" onClick={() => close()}>×</button>
    </header>
    <div class="tag-index-filter">
      <label>Tag or filter<span class="tag-name-control"><span aria-hidden="true">#</span>
        <input ref={input} type="text" role="combobox" autocomplete="off" spellcheck={false}
          aria-autocomplete="list" aria-haspopup="grid" aria-controls="tag-matching-list" aria-expanded={matches().length > 0}
          aria-activedescendant={activeTag() === null ? undefined : `tag-add-${activeTag()}`}
          value={query()} onInput={(event) => { setQuery(event.currentTarget.value); setActiveTag(null); }} onKeyDown={fieldKeyDown} />
      </span></label>
      <button type="button" class="tag-field-add" classList={{ "is-secondary-focus": activeTag() === null }}
        hidden={query().trim().length === 0} disabled={!canAdd() || normalized() === null} onClick={() => add(normalized())}>{props.tags.includes(normalized() ?? "") ? "Use" : "Create"}</button>
    </div>
    <label class="tag-order-toggle"><input type="checkbox" checked={props.alphabetical}
      onChange={(event) => props.onAlphabeticalChange(event.currentTarget.checked)} /> Alphabetical order</label>
    <Show when={props.insertionUnavailable}>{(reason) => <p class="tag-index-help">{reason()}</p>}</Show>
    <Show when={props.addError}>{(error) => <p role="alert">{error()}</p>}</Show>
    <Show when={props.listError}>{(error) => <p role="alert">{error()} <button type="button" onClick={() => void props.onRefresh()}>Retry tags</button></p>}</Show>
    <Show when={!props.refreshing && !props.listError && !props.tags.length}><p>No indexed tags yet. Add a tag to a note and sync it.</p></Show>
    <ul id="tag-matching-list" role="grid" class="tag-index-tags" aria-label="Matching tags">
      <For each={matches()}>{(tag) => <TagRow tag={tag} modifiedTime={props.modifiedTime?.(tag) ?? null}
        indexed={props.hasIndex?.(tag) ?? true} loadIndex={props.loadIndex} addDisabled={!canAdd()} active={activeTag() === tag}
        onAdd={() => add(tag)} onSelect={(target) => { close(false); props.onSelect(target); }}
        registerAdd={(button) => { if (button) addButtons.set(tag, button); else addButtons.delete(tag); }} />}</For>
    </ul>
    <Show when={props.tags.length > 0 && !matches().length}><p>No tags match this prefix.</p></Show>
  </dialog>;
}

function TagRow(props: {
  tag: string; modifiedTime: string | null; indexed: boolean; loadIndex: (tag: string) => Promise<string>;
  addDisabled: boolean; active: boolean; onAdd: () => void; onSelect: (target: TagIndexTarget) => void;
  registerAdd: (button: HTMLButtonElement | null) => void;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [rows, setRows] = createSignal<readonly TagIndexRow[] | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const displayRows = createMemo(() => newestTagIndexRows(rows() ?? []));
  let generation = 0;
  onCleanup(() => { generation++; props.registerAdd(null); });
  const load = async () => {
    const request = ++generation;
    setLoading(true); setError(null);
    try {
      const content = await props.loadIndex(props.tag);
      if (request === generation) setRows(parseTagIndexRows(content));
    } catch (cause) {
      if (request === generation) setError(cause instanceof Error ? cause.message : "Could not load this tag. Please retry.");
    } finally { if (request === generation) setLoading(false); }
  };
  createEffect(on(() => props.indexed ? `indexed:${props.modifiedTime ?? "unknown"}` : "local-only", () => {
    // Invalidate both cached rows and in-flight responses from the previous index version.
    generation++;
    setRows(null); setError(null); setLoading(false);
    if (expanded()) void load();
  }, { defer: true }));
  const toggle = () => {
    const opening = !expanded();
    setExpanded(opening);
    if (!opening) { generation++; setLoading(false); }
    else if (rows() === null) void load();
  };
  return <li class="tag-index-tag" role="rowgroup">
    <div class="tag-index-row" role="row" title={expanded() ? "Click to hide tag occurrences" : "Click to show tag occurrences"} onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("button") === null) toggle();
    }}>
      <div role="gridcell" class="tag-summary-cell">
      <button type="button" class="tag-index-row-heading" aria-label={`${expanded() ? "Collapse" : "Expand"} #${props.tag}`}
        aria-expanded={expanded()} aria-controls={`tag-occurrences-${props.tag}`} onClick={toggle}>
        <span aria-hidden="true" class="tag-expand-icon">{expanded() ? "▾" : "▸"}</span>
        <span class="tag-chip">#{props.tag}</span>
        <span class="tag-index-modified" title="This tag may have been added or removed, or its tagged text may have changed.">Changed <time dateTime={props.modifiedTime ?? undefined}>{props.modifiedTime ? formatSearchModifiedTime(props.modifiedTime) : "Unknown"}</time></span>
      </button>
      </div>
      <div role="gridcell" class="tag-add-cell"><button ref={(button) => props.registerAdd(button)} id={`tag-add-${props.tag}`} type="button" class="tag-row-add"
        classList={{ "is-secondary-focus": props.active }} aria-label={`Use #${props.tag}`} title={`Use #${props.tag}`} disabled={props.addDisabled} onClick={props.onAdd}>Use</button></div>
    </div>
    <Show when={expanded()}>
      <section id={`tag-occurrences-${props.tag}`} class="tag-index-results" role="row" aria-label={`Occurrences of #${props.tag}`} aria-busy={loading()}>
        <div role="gridcell">
        <Show when={loading()}><p role="status">Loading occurrences…</p></Show>
        <Show when={error()}>{(message) => <p role="alert">{message()} <button type="button" onClick={() => void load()}>Retry occurrences</button></p>}</Show>
        <Show when={!loading() && !error()}>
          <Show when={rows()?.length} fallback={<p>No synced occurrences yet. Sync the note or rebuild the index in Settings.</p>}>
            <ol class="tag-index-rows"><For each={displayRows()}>{(row, index) => <li>
              <button type="button" class="tag-index-occurrence" title="Open this tag occurrence"
                aria-label={`Open ${row.date}: ${row.excerpt || "No context"} (occurrence ${row.ordinal + 1})`}
                onClick={() => props.onSelect(tagIndexTarget(props.tag, row, rows()!))}>
                <time dateTime={row.date} class="tag-index-date" classList={{ "tag-date-repeated": index() > 0 && displayRows()[index() - 1]?.date === row.date }}>{row.date}</time>
                <TagIndexExcerpt markdown={row.excerpt || "(No context)"} />
              </button>
            </li>}</For></ol>
          </Show>
        </Show>
        </div>
      </section>
    </Show>
  </li>;
}
