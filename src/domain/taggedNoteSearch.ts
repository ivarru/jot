import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, Nodes, TableCell, Definition } from "mdast";
import { extractJotTags } from "./jotTags";
import { dailyNoteMatchesSearch } from "./dailyNoteSearch";

const parser = remark().use(remarkGfm);

export interface TaggableSearchPassage {
  readonly start: number;
  readonly end: number;
  readonly insertionOffset: number;
  readonly text: string;
  readonly effectiveTags: readonly string[];
}

/** Find a paragraph/list-item target in this exact source; headings and declarations are excluded. */
export function findTaggableSearchPassage(source: string, query: string, tags: readonly string[]): TaggableSearchPassage | null {
  let target: TaggableSearchPassage | null = null;
  matchingTaggedPassage(source, query, tags, (passage) => { target = passage; });
  return target;
}

/** Return the first qualifying Markdown passage from this explicit snapshot. */
export function matchingTaggedPassage(source: string, query: string, tags: readonly string[], onTarget?: (passage: TaggableSearchPassage) => void): string | null {
  const root = parser.parse(source) as Root;
  // CommonMark definitions are document-wide, including those inside quotes and lists.
  // Depth-first traversal retains source order so the first definition wins.
  const definitionNodes: Definition[] = [];
  const collectDefinitions = (node: Nodes) => {
    if (node.type === "definition") definitionNodes.push(node);
    if ("children" in node) for (const child of node.children) collectDefinitions(child);
  };
  collectDefinitions(root);
  const definitions = parser.stringify({ type: "root", children: definitionNodes });
  // Serialize the unit itself: source slices inside quotes/lists contain container markers.
  const markdown = (node: RootContent | TableCell): string => parser.stringify({ type: "root", children: [
    node.type === "tableCell" ? { type: "paragraph", children: node.children } : node
  ] });
  const tagsOf = (text: string) => extractJotTags(`${text}\n\n${definitions}`);
  const visibleText = (node: Nodes): string => {
    if (node.type === "break") return " ";
    if (node.type === "link" && node.url.startsWith("jot:tag/")) return "";
    if (node.type === "linkReference" && tagsOf(source.slice(node.position!.start.offset!, node.position!.end.offset!)).length) return "";
    return "value" in node ? node.value : "alt" in node ? node.alt ?? ""
      : "children" in node ? node.children.map(visibleText).join("") : "";
  };
  const match = (text: string, prose: string, inherited: readonly string[], target: Nodes): string | null => {
    if (target.type === "heading" || /^Tags:\s*$/i.test(prose.trim())
      || target.type === "tableCell" && !target.children.length) return null;
    const effective = new Set([...inherited, ...tagsOf(text)]);
    if (!tags.every((tag) => effective.has(tag)) || (query.trim() && !dailyNoteMatchesSearch(prose, query))) return null;
    // A final table cell's span may include its closing pipe. Inline content excludes that delimiter.
    const insertionOffset = target.type === "tableCell" && target.children.length
      ? target.children[target.children.length - 1]!.position!.end.offset! : target.position!.end.offset!;
    onTarget?.({ start: target.position!.start.offset!, end: target.position!.end.offset!, insertionOffset, text: prose,
      effectiveTags: [...effective] });
    return `${text}\n\n${definitions}`;
  };
  const check = (node: RootContent, inherited: readonly string[]): string | null => {
    if (node.type === "list") {
      for (const item of node.children) {
        const direct = item.children.filter((child) => child.type === "paragraph");
        const hit = direct.length ? match(direct.map(markdown).join("\n\n"), direct.map(visibleText).join(" "), inherited, direct[direct.length - 1]!) : null;
        if (hit !== null) return hit;
        // Nested items retain enclosing section tags, but not their parent item's direct tags.
        const nested = visit(item.children, inherited);
        if (nested !== null) return nested;
      }
      return null;
    }
    if (node.type === "blockquote") return visit(node.children, inherited);
    if (node.type === "table") {
      for (const row of node.children) for (const cell of row.children) {
        const hit = match(markdown(cell), visibleText(cell), inherited, cell);
        if (hit !== null) return hit;
      }
      return null;
    }
    if (node.type !== "paragraph" && node.type !== "heading") return null;
    return match(markdown(node), visibleText(node), inherited, node);
  };
  const visit = (nodes: readonly RootContent[], inherited: readonly string[]): string | null => {
    // Each container has its own heading stack; its declarations cannot escape to siblings.
    const sections: { depth: number; tags: readonly string[] }[] = [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!;
      if (node.type === "heading") {
        while (sections.length && sections[sections.length - 1]!.depth >= node.depth) sections.pop();
        const next = nodes[index + 1];
        const declaration = next?.type === "paragraph" && /^Tags:\s*/i.test(visibleText(next)) && tagsOf(markdown(next)).length > 0
          && visibleText(next).replace(/^Tags:\s*/i, "").trim() === "";
        sections.push({ depth: node.depth, tags: declaration ? tagsOf(markdown(next!)) : [] });
      }
      const hit = check(node, [...inherited, ...sections.flatMap((section) => section.tags)]);
      if (hit !== null) return hit;
    }
    return null;
  };
  return visit(root.children, []);
}
