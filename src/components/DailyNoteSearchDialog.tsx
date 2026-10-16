import { DailyNoteSearchResult as SearchResultRow } from "./DailyNoteSearchResult";
import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { parseIsoDate, type IsoDate } from "~/domain/dates";
import { validateDailyNoteSearch, type DailyNoteSearch, type DailyNoteSearchResult } from "~/domain/dailyNoteSearch";

interface Props {
  readonly selectedDate: IsoDate;
  readonly today: IsoDate;
  readonly search: (input: DailyNoteSearch) => Promise<DailyNoteSearchResult[]>;
  readonly getImmediatePreview?: (result: DailyNoteSearchResult, query: string) => string | null;
  readonly loadPreview: (result: DailyNoteSearchResult) => Promise<string>;
  readonly resolveImage?: (id: string) => Promise<ImageAttachmentDisplay>;
  readonly onSelect: (date: IsoDate) => void;
  readonly onClose: () => void;
}

export function DailyNoteSearchDialog(props: Props) {
  let dialog!: HTMLDialogElement;
  let queryInput!: HTMLInputElement;
  let request = 0;
  let resizeStart: { x: number; y: number; width: number; height: number } | undefined;
  const resizeTo = (width: number, height: number) => {
    const maxWidth = window.innerWidth - 24;
    const maxHeight = window.innerHeight - 24;
    dialog.style.width = `${Math.max(Math.min(340, maxWidth), Math.min(width, maxWidth))}px`;
    dialog.style.height = `${Math.max(Math.min(240, maxHeight), Math.min(height, maxHeight))}px`;
  };
  const [query, setQuery] = createSignal("");
  const [start, setStart] = createSignal("");
  const [end, setEnd] = createSignal("");
  const [dateBasis, setDateBasis] = createSignal<"note" | "modified">("note");
  const [dates, setDates] = createSignal<DailyNoteSearchResult[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [searched, setSearched] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const invalidate = () => {
    request++;
    setLoading(false);
    setSearched(false);
    setDates([]);
    setError(null);
  };
  const close = () => {
    invalidate();
    dialog.close?.();
    props.onClose();
  };
  onMount(() => { dialog.showModal?.(); queryInput.focus(); });
  onCleanup(() => { request++; });
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    invalidate();
    const id = request;
    try {
      if (!navigator.onLine) throw new Error("Search is unavailable offline. Connect and try again.");
      const startDate = start() ? parseIsoDate(start()) : undefined;
      const endDate = end() ? parseIsoDate(end()) : undefined;
      if (startDate === null || endDate === null) throw new Error("Enter valid dates.");
      const input = { query: query(), dateBasis: dateBasis(), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };
      validateDailyNoteSearch(input);
      setLoading(true);
      const results = await props.search(input);
      if (id !== request) return;
      setDates(results);
      setSearched(true);
    } catch (cause) {
      if (id !== request) return;
      setError(cause instanceof Error ? cause.message : "Search failed. Please try again.");
    } finally {
      if (id === request) setLoading(false);
    }
  };
  return (
    <dialog ref={dialog} class="settings-dialog search-dialog" aria-label="Search daily notes" aria-modal="true"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <div class="search-dialog-content">
      <header class="settings-panel-header">
        <h2>Search daily notes</h2>
        <button type="button" class="icon-button" aria-label="Close search" onClick={close}>×</button>
      </header>
      <p id="daily-note-search-help">Search synced content. Recent changes may take time to appear. All words must match; use quotation marks for a phrase.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>Search words<input ref={queryInput} type="search" value={query()} aria-describedby="daily-note-search-help"
          onInput={(event) => { setQuery(event.currentTarget.value); invalidate(); }} /></label>
        <label class="search-date-basis"><input type="checkbox" checked={dateBasis() === "modified"}
          onChange={(event) => { setDateBasis(event.currentTarget.checked ? "modified" : "note"); invalidate(); }} />
          <span>Filter by last modified date</span>
        </label>
        <div class="search-date-range">
          <label>Start date<input type="date" value={start()} onInput={(event) => { setStart(event.currentTarget.value); invalidate(); }} /></label>
          <label>End date (not included)<input type="date" value={end()} onInput={(event) => { setEnd(event.currentTarget.value); invalidate(); }} /></label>
        </div>
        <div class="search-actions">
          <button type="submit" class="search-submit" disabled={!query().trim()}>Search</button>
          <button type="button" onClick={() => { setStart(""); setEnd(""); invalidate(); }}>Clear dates</button>
        </div>
      </form>
      <Show when={error()}>{(message) => <p role="alert">Search failed: {message()} Reconnect if needed, then try again.</p>}</Show>
      <div role="status" aria-live="polite">
        <Show when={loading()}>Searching…</Show>
        <Show when={searched()}>{dates().length ? `${dates().length} matching daily notes, newest first.` : "No matching daily notes."}</Show>
      </div>
      <Show when={dates().length}>
        <ul aria-label="Matching daily notes"><For each={dates()}>{(result) =>
          <SearchResultRow result={result} query={query()} selectedDate={props.selectedDate} today={props.today} loadPreview={props.loadPreview} {...(props.getImmediatePreview ? { getImmediatePreview: props.getImmediatePreview } : {})}
            {...(props.resolveImage ? { resolveImage: props.resolveImage } : {})}
            onOpen={() => { close(); props.onSelect(result.date); }} />
        }</For></ul>
      </Show>
      </div>
      <button type="button" class="search-dialog-resize" aria-label="Resize search dialog"
        title="Drag to resize, or use the arrow keys" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          const bounds = dialog.getBoundingClientRect();
          resizeStart = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!resizeStart) return;
          // Both edges move around the fixed center, so dimensions change by twice the pointer delta.
          resizeTo(resizeStart.width + 2 * (event.clientX - resizeStart.x),
            resizeStart.height + 2 * (event.clientY - resizeStart.y));
        }}
        onPointerUp={(event) => {
          resizeStart = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { resizeStart = undefined; }}
        onLostPointerCapture={() => { resizeStart = undefined; }}
        onKeyDown={(event) => {
          if (!event.key.startsWith("Arrow") || event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault(); event.stopPropagation();
          const bounds = dialog.getBoundingClientRect();
          resizeTo(bounds.width + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0),
            bounds.height + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0));
        }}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="m5 15 10-10M10 15l5-5" />
        </svg>
      </button>
    </dialog>
  );
}
