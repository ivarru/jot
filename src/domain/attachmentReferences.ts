const IMAGE_REFERENCE_PATTERN = /!\[((?:\\.|[^\]\\])*)\]\(jot:image:([0-9A-HJKMNP-TV-Z]{26})\)/g;

export interface ImageAttachmentReference {
  readonly altText: string;
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

export function createImageAttachmentReference(id: string, altText = ""): string {
  return `![${escapeMarkdownAltText(altText)}](jot:image:${id})`;
}

export function appendImageAttachmentReference(markdown: string, reference: string): string {
  if (markdown.length === 0) return reference;
  return markdown.endsWith("\n") ? `${markdown}${reference}` : `${markdown}\n\n${reference}`;
}

export function findImageAttachmentReferences(markdown: string): ImageAttachmentReference[] {
  return Array.from(markdown.matchAll(IMAGE_REFERENCE_PATTERN), (match) => ({
    altText: unescapeMarkdownAltText(match[1] ?? ""),
    id: match[2] ?? "",
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

function escapeMarkdownAltText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
}

function unescapeMarkdownAltText(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}
