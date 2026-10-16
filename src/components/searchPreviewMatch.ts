import { dailyNoteSearchTerms } from "~/domain/dailyNoteSearch";

/** Locate the earliest matching word/phrase in rendered text, including across inline formatting. */
export function firstPreviewMatch(root: HTMLElement, query: string): Range | null {
  const patterns = dailyNoteSearchTerms(query).map((term) => {
    const text = term.replace(/^"|"$/g, "");
    const escaped = text.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
  });
  for (const block of root.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6, pre")) {
    const text = block.textContent ?? "";
    const matches = patterns.map((pattern) => pattern.exec(text)).filter((match) => match !== null);
    const match = matches.sort((a, b) => a.index - b.index)[0];
    if (!match) continue;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    let started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (!started && match.index < offset + length) {
        range.setStart(node, match.index - offset);
        started = true;
      }
      if (started && match.index + match[0].length <= offset + length) {
        range.setEnd(node, match.index + match[0].length - offset);
        return range;
      }
      offset += length;
    }
  }
  return null;
}
