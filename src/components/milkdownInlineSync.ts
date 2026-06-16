import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { InlineSyncConfig } from "@milkdown/plugin-automd";

const FULL_MARKDOWN_LINK_PATTERN = /\[[^\]\n]+]\([^\s\]\n]+\)/;
const MARKDOWN_AUTOLINK_PATTERN = /^<[^<>\s]+>/;
const RAW_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

export function shouldSyncMilkdownInlineMarkdown(
  defaultShouldSyncNode: InlineSyncConfig["shouldSyncNode"]
): InlineSyncConfig["shouldSyncNode"] {
  return (context) => {
    if (hasLinkMark(context.prevNode) && linkLikeText(context.text)) return false;
    return defaultShouldSyncNode(context);
  };
}

function linkLikeText(text: string): boolean {
  return FULL_MARKDOWN_LINK_PATTERN.test(text) || MARKDOWN_AUTOLINK_PATTERN.test(text) || RAW_URL_PATTERN.test(text);
}

function hasLinkMark(node: ProseNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (child.marks.some((mark) => mark.type.name === "link")) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}
