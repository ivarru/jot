import { createMemo, For } from "solid-js";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

const parser = remark().use(remarkGfm);
interface Node { type: string; value?: string; children?: Node[]; alt?: string }

/** Render the supported inline subset as safe elements, without HTML injection or navigable links. */
export function TagIndexExcerpt(props: { readonly markdown: string }) {
  const root = createMemo(() => parser.parse(props.markdown) as unknown as Node);
  const content = (node: Node) => <For each={node.children ?? []}>{renderNode}</For>;
  const renderNode = (node: Node): import("solid-js").JSX.Element => {
    switch (node.type) {
      case "strong": return <strong>{content(node)}</strong>;
      case "emphasis": return <em>{content(node)}</em>;
      case "delete": return <del>{content(node)}</del>;
      case "inlineCode": return <code>{node.value}</code>;
      case "link": case "linkReference": return <span class="tag-index-inert-link" role="link" aria-disabled="true">{content(node)}</span>;
      case "break": return " ";
      case "image": case "imageReference": return node.alt ?? "";
      default: return node.value ?? content(node);
    }
  };
  return <span class="tag-index-excerpt">{content(root())}</span>;
}
