import { Show, createSignal, createUniqueId, onCleanup } from "solid-js";
import { DailyNoteSearchPreview } from "./DailyNoteSearchPreview";
import { formatSearchModifiedTime, type DailyNoteSearchResult as SearchResult } from "~/domain/dailyNoteSearch";
import type { IsoDate } from "~/domain/dates";
import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";

export function DailyNoteSearchResult(props: {
  readonly result: SearchResult;
  readonly selectedDate: IsoDate;
  readonly today: IsoDate;
  readonly query: string;
  readonly getImmediatePreview?: (result: SearchResult, query: string) => string | null;
  readonly loadPreview: (result: SearchResult) => Promise<string>;
  readonly resolveImage?: (id: string) => Promise<ImageAttachmentDisplay>;
  readonly onOpen: () => void;
}) {
  const id = createUniqueId();
  const markers = () => [props.result.date === props.today ? "today" : null,
    props.result.date === props.selectedDate ? "open" : null].filter(Boolean).join(", ");
  const label = () => `${props.result.date}${markers() ? ` (${markers()})` : ""}`;
  const [expanded, setExpanded] = createSignal(false);
  const [markdown, setMarkdown] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let request = 0;
  onCleanup(() => { request++; });
  const load = async () => {
    const snapshot = props.result;
    const version = ++request;
    setError(null); setLoading(true);
    try {
      const content = await props.loadPreview(snapshot);
      if (version === request) setMarkdown(content);
    } catch (cause) {
      if (version === request) setError(cause instanceof Error ? cause.message : "Could not load preview.");
    } finally {
      if (version === request) setLoading(false);
    }
  };
  const toggle = () => {
    if (expanded()) { request++; setLoading(false); setExpanded(false); return; }
    setExpanded(true);
    const immediate = props.getImmediatePreview?.(props.result, props.query) ?? null;
    if (immediate !== null) { setMarkdown(immediate); setError(null); }
    else if (markdown() === null) void load();
  };
  return <li class="search-result">
    <div class="search-result-heading">
      <button class="search-result-row" type="button" aria-label={label()} aria-describedby={`${id}-metadata`}
        title={expanded() ? "Click to close preview" : "Click to preview"}
        aria-expanded={expanded()} aria-controls={expanded() ? `${id}-preview` : undefined} onClick={toggle}>
        <span class="search-expand-icon" aria-hidden="true">{expanded() ? "▾" : "▸"}</span>
        <span class="search-result-date">{props.result.date}<Show when={markers()}><span class="search-result-marker"> ({markers()})</span></Show></span>
        <span id={`${id}-metadata`} class="search-result-metadata">
          <span>
            <span class="search-metadata-label">Last modified </span>
            <Show when={props.result.modifiedTime} fallback="Unknown">{(timestamp) =>
              <time dateTime={timestamp()} title="Last modified (local time)">{formatSearchModifiedTime(timestamp())}</time>}
            </Show>
          </span>
          <span><span class="search-metadata-label">Size </span>{props.result.sizeBytes === null ? "Unknown" : `${props.result.sizeBytes} bytes`}</span>
        </span>
      </button>
      <button type="button" class="search-result-open" aria-label={`Open note ${props.result.date}`} title="Open note" onClick={props.onOpen}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" />
        </svg>
      </button>
    </div>
    <Show when={expanded()}>
      <section class="search-result-preview" id={`${id}-preview`} aria-label={`Preview ${props.result.date}`}>
        <Show when={loading()}><p role="status">Loading note…</p></Show>
        <Show when={error()}>{(message) => <div role="alert"><p>{message()}</p><button type="button" onClick={() => void load()}>Retry preview</button></div>}</Show>
        <Show when={markdown() !== null}>
          <DailyNoteSearchPreview documentKey={`search-preview:${props.result.date}:${props.result.fileId}`}
            markdown={markdown()!} query={props.query} onOpen={props.onOpen} {...(props.resolveImage ? { resolveImage: props.resolveImage } : {})} />
        </Show>
      </section>
    </Show>
  </li>;
}
