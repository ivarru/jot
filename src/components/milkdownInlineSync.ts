import type { InlineSyncConfig } from "@milkdown/plugin-automd";
import type { Mark, Node as ProseNode } from "@milkdown/kit/prose/model";

export function shouldSyncMilkdownInlineMarkdown(
  defaultShouldSyncNode: InlineSyncConfig["shouldSyncNode"],
  placeholderConfig: InlineSyncConfig["placeholderConfig"]
): InlineSyncConfig["shouldSyncNode"] {
  const placeholders = [
    placeholderConfig.hole,
    placeholderConfig.punctuation,
    placeholderConfig.char
  ];

  return (context) => {
    // Automd rebuilds the whole inline node and can widen an existing link across
    // adjacent plain text. Reject only those candidates; unrelated Markdown
    // transformations remain enabled in the same block.
    if (!preservesExistingLinks(context.prevNode, context.nextNode, placeholders)) return false;
    return defaultShouldSyncNode(context);
  };
}

interface LinkedText {
  readonly text: string;
  readonly mark: Mark;
}

function preservesExistingLinks(
  currentNode: ProseNode,
  proposedNode: ProseNode,
  placeholders: readonly string[]
): boolean {
  const currentLinks = linkedText(currentNode);
  if (currentLinks.length === 0) return true;

  const proposedLinks = linkedText(proposedNode, placeholders);
  return currentLinks.length === proposedLinks.length
    && currentLinks.every((current, index) => {
      const proposed = proposedLinks[index];
      return proposed !== undefined
        && current.text === proposed.text
        && current.mark.eq(proposed.mark);
    });
}

function linkedText(node: ProseNode, placeholders: readonly string[] = []): LinkedText[] {
  const links: LinkedText[] = [];
  node.descendants((child) => {
    if (!child.isText) return true;
    const link = child.marks.find((mark) => mark.type.name === "link");
    if (link === undefined) return false;

    // Automd inserts one configured placeholder while parsing its candidate node.
    const text = placeholders.reduce(
      (value, placeholder) => value.replaceAll(placeholder, ""),
      child.text ?? ""
    );
    const previous = links.at(-1);
    if (previous !== undefined && previous.mark.eq(link)) {
      links[links.length - 1] = { ...previous, text: previous.text + text };
    } else {
      links.push({ text, mark: link });
    }
    return false;
  });
  return links;
}
