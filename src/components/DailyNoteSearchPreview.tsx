import { createSignal, onCleanup, onMount } from "solid-js";
import { MilkdownEditor } from "./MilkdownEditor";
import { firstPreviewMatch } from "./searchPreviewMatch";
import { findImageAttachmentReferences } from "~/domain/attachmentReferences";
import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";
import type { ImageAttachmentDisplayMap } from "./milkdownImages";

export function DailyNoteSearchPreview(props: {
  readonly documentKey: string;
  readonly markdown: string;
  readonly query: string;
  readonly onOpen: () => void;
  readonly resolveImage?: (id: string) => Promise<ImageAttachmentDisplay>;
}) {
  let viewport!: HTMLDivElement;
  let disposed = false;
  let ready = false;
  let userScrolled = false;
  let frame: number | undefined;
  const [images, setImages] = createSignal<ImageAttachmentDisplayMap>({});
  const [status, setStatus] = createSignal("Read-only preview. Links are disabled. Click to open.");
  const alignMatch = () => {
    if (disposed || !ready || userScrolled) return;
    const root = viewport.querySelector<HTMLElement>(".ProseMirror");
    if (!root) return;
    const range = firstPreviewMatch(root, props.query);
    setStatus(range ? "Read-only preview. First match in view. Links are disabled. Click to open." : "Read-only preview. No text match in this version. Links are disabled. Click to open.");
    if (range) {
      viewport.scrollTop += range.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 24;
      // A short screen can also clip the preview inside the dialog. Scroll that dialog, never the editor page.
      const dialog = viewport.closest("dialog");
      if (dialog) {
        const hit = range.getBoundingClientRect();
        const bounds = dialog.getBoundingClientRect();
        if (hit.bottom > bounds.bottom - 16 || hit.top < bounds.top + 16) {
          const content = viewport.closest<HTMLElement>(".search-dialog-content") ?? dialog;
          content.scrollTop += hit.top - bounds.top - 32;
        }
      }
    }
  };
  const scheduleAlign = () => {
    if (disposed) return;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(alignMatch);
  };
  const disableControls = () => {
    for (const link of viewport.querySelectorAll<HTMLAnchorElement>("a")) {
      link.tabIndex = -1;
      link.setAttribute("aria-disabled", "true");
    }
    for (const input of viewport.querySelectorAll<HTMLInputElement>("input")) input.disabled = true;
  };
  const blockInteraction = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("a, input, button")) {
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "click" && !window.getSelection()?.toString()) props.onOpen();
    }
  };
  onMount(() => {
    const observer = new MutationObserver(() => { disableControls(); scheduleAlign(); });
    observer.observe(viewport, { childList: true, subtree: true });
    const resize = new ResizeObserver(scheduleAlign);
    resize.observe(viewport);
    viewport.addEventListener("click", blockInteraction, true);
    viewport.addEventListener("auxclick", blockInteraction, true);
    viewport.addEventListener("contextmenu", blockInteraction, true);
    viewport.addEventListener("load", scheduleAlign, true);
    onCleanup(() => {
      observer.disconnect(); resize.disconnect();
      viewport.removeEventListener("click", blockInteraction, true);
      viewport.removeEventListener("auxclick", blockInteraction, true);
      viewport.removeEventListener("contextmenu", blockInteraction, true);
      viewport.removeEventListener("load", scheduleAlign, true);
    });
    for (const id of new Set(findImageAttachmentReferences(props.markdown).map((reference) => reference.id))) {
      if (!props.resolveImage) continue;
      void props.resolveImage(id).then((display) => {
        if (!disposed) setImages((current) => ({ ...current, [id]: display }));
      }).catch(() => {
        if (!disposed) setImages((current) => ({ ...current, [id]: { id, status: "error", message: "Could not load image preview." } }));
      });
    }
  });
  onCleanup(() => { disposed = true; if (frame !== undefined) cancelAnimationFrame(frame); });
  return <>
    <div ref={viewport} class="search-preview-viewport" tabIndex={0} role="region" aria-label="Read-only note preview"
      title={status()} aria-description={status()} aria-keyshortcuts="Enter"
      onClick={(event) => {
        const bounds = viewport.getBoundingClientRect();
        if (event.clientX >= bounds.left + viewport.clientWidth || event.clientY >= bounds.top + viewport.clientHeight) return;
        if (!window.getSelection()?.toString()) props.onOpen();
      }}
      onPointerDown={() => { userScrolled = true; }} onWheel={() => { userScrolled = true; }} onTouchMove={() => { userScrolled = true; }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === viewport) { event.preventDefault(); props.onOpen(); }
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) userScrolled = true; }}>
      <MilkdownEditor documentKey={props.documentKey} value={props.markdown} readOnly focusEnabled={false}
        imageAttachmentDisplays={images()} onChange={() => {}} onBlur={() => {}} onOpenLink={() => true}
        onController={(controller) => { if (controller) { ready = true; disableControls(); scheduleAlign(); } }} />
    </div>
  </>;
}
