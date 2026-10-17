import type { MarkdownSelection } from "~/editor/markdownSelection";

/** The raw editor's existing layout mirror provides wrapped-line geometry without altering its contents. */
export function scrollRawSelection(textarea: HTMLTextAreaElement, source: string, selection: MarkdownSelection): void {
  const mirror = textarea.parentElement?.querySelector(".plain-text-hard-break-highlights");
  if (!mirror || mirror.textContent !== source || textarea.value !== source) return;
  const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
  let offset = selection.start;
  let text: Node | null;
  while ((text = walker.nextNode())) {
    const length = text.textContent?.length ?? 0;
    if (offset < length) {
      const range = document.createRange();
      range.setStart(text, offset); range.setEnd(text, Math.min(offset + 1, length));
      if (typeof range.getBoundingClientRect !== "function") return;
      const bounds = range.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + bounds.top - window.innerHeight / 2, behavior: "auto" });
      return;
    }
    offset -= length;
  }
}
