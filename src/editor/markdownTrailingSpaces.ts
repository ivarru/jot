import type { Root, RootContent } from "mdast";

/** Retain source whitespace that CommonMark drops at a paragraph's end. */
export function preserveParagraphTrailingSpaces() {
  return (tree: Root, file: { toString(): string }): void => {
    const source = file.toString();
    const visit = (node: Root | RootContent): void => {
      if (node.type === "paragraph") {
        const last = node.children.at(-1);
        const start = last?.position?.end.offset;
        const end = node.position?.end.offset;
        if (start !== undefined && end !== undefined) {
          const trailing = source.slice(start, end);
          // Browsers preserve an editable terminal separator as NBSP. An ordinary
          // rendered space collapses and may be removed by the next native input.
          // Milkdown serialization already converts NBSP back to source spaces.
          if (/^[ \t]+$/.test(trailing)) node.children.push({
            type: "text",
            value: trailing.replaceAll(" ", "\u00a0"),
            position: { start: last!.position!.end, end: node.position!.end }
          });
        }
      }
      if ("children" in node) node.children.forEach(visit);
    };
    visit(tree);
  };
}
