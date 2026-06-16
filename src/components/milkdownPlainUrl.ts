import type { MarkType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

const PLAIN_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

export function createPlainUrlLinkBoundaryPlugin(
  Plugin: typeof import("@milkdown/kit/prose/state").Plugin,
  TextSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  linkType: MarkType
) {
  return new Plugin({
    props: {
      handlePaste: (view, event) => {
        const url = plainClipboardUrl(event);
        if (url === null) return false;

        view.dispatch(linkedUrlTransaction(
          view.state,
          TextSelection,
          linkType,
          view.state.selection.from,
          view.state.selection.to,
          url
        ));
        return true;
      },
      handleTextInput: (view, from, to, text) => {
        const url = text.trim();
        if (url !== text || !PLAIN_URL_PATTERN.test(url)) return false;

        view.dispatch(linkedUrlTransaction(view.state, TextSelection, linkType, from, to, url));
        return true;
      }
    }
  });
}

function linkedUrlTransaction(
  state: EditorState,
  TextSelection: typeof import("@milkdown/kit/prose/state").TextSelection,
  linkType: MarkType,
  from: number,
  to: number,
  url: string
): Transaction {
  const link = linkType.create({ href: url });
  const cursor = from + url.length;
  let transaction = state.tr.replaceRangeWith(from, to, state.schema.text(url, [link]));
  transaction = transaction.setSelection(TextSelection.create(transaction.doc, cursor));
  return transaction.setStoredMarks(marksWithoutLink(transaction.selection.$from.marks(), linkType));
}

function plainClipboardUrl(event: ClipboardEvent): string | null {
  const clipboard = event.clipboardData;
  if (clipboard === null) return null;

  const text = clipboard.getData("text/plain").trim();
  if (!PLAIN_URL_PATTERN.test(text)) return null;

  const html = clipboard.getData("text/html").trim();
  return html.length === 0 ? text : null;
}

function marksWithoutLink(
  marks: readonly import("@milkdown/kit/prose/model").Mark[],
  linkType: MarkType
): readonly import("@milkdown/kit/prose/model").Mark[] {
  return marks.filter((mark) => mark.type !== linkType);
}
