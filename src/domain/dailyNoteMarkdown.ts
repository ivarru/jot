export function hasDailyNoteContent(markdown: string): boolean {
  return markdown.trim().length > 0;
}

export interface DailyNoteMarkdownNormalizationOptions {
  readonly normalizeEmptyEditorPlaceholders?: boolean;
}

export function normalizeDailyNoteMarkdown(
  markdown: string,
  options: DailyNoteMarkdownNormalizationOptions = {}
): string {
  const normalized = options.normalizeEmptyEditorPlaceholders === true
    ? normalizeEmptyEditorPlaceholders(markdown)
    : markdown;
  return hasDailyNoteContent(normalized) ? normalized : "";
}

function normalizeEmptyEditorPlaceholders(markdown: string): string {
  const lines = markdown.split("\n");
  const normalized: MarkdownLine[] = [];
  let fence: MarkdownFence | null = null;
  let indentedCode = false;
  let htmlBlock: HtmlBlock | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (fence !== null) {
      normalized.push({ value: line, protected: true });
      if (isClosingFence(line, fence)) fence = null;
      continue;
    }

    if (htmlBlock !== null) {
      normalized.push({ value: line, protected: true });
      if (htmlBlockEnds(line, htmlBlock)) htmlBlock = null;
      continue;
    }

    const openingFence = markdownFence(line);
    if (openingFence !== null) {
      fence = openingFence;
      normalized.push({ value: line, protected: true });
      continue;
    }

    if (isIndentedCodeLine(line)) {
      indentedCode = true;
      normalized.push({ value: line, protected: true });
      continue;
    }

    if (indentedCode && line === "") {
      normalized.push({ value: line, protected: true });
      continue;
    }

    indentedCode = false;

    if (isEmptyListItemPlaceholder(line)) continue;
    if (isEmptyParagraphPlaceholder(line)) {
      normalized.push({ value: "", protected: false });
      continue;
    }

    const openingHtmlBlock = htmlBlockStart(line);
    if (openingHtmlBlock !== null) {
      normalized.push({ value: line, protected: true });
      if (!htmlBlockEnds(line, openingHtmlBlock)) htmlBlock = openingHtmlBlock;
      continue;
    }

    normalized.push({ value: line, protected: false });
  }

  return collapseBlankLines(normalized).map((line) => line.value).join("\n");
}

interface MarkdownLine {
  readonly value: string;
  readonly protected: boolean;
}

interface MarkdownFence {
  readonly character: "`" | "~";
  readonly length: number;
}

type HtmlBlock =
  | { readonly kind: "closing-tag"; readonly tag: string }
  | { readonly kind: "closing-sequence"; readonly sequence: string }
  | { readonly kind: "until-blank" };

function markdownFence(line: string): MarkdownFence | null {
  const match = /^[ ]{0,3}(`{3,}|~{3,})/.exec(line);
  if (match === null) return null;
  const marker = match[1]!;
  return { character: marker[0]! as MarkdownFence["character"], length: marker.length };
}

function isClosingFence(line: string, fence: MarkdownFence): boolean {
  const escapedCharacter = fence.character === "`" ? "`" : "~";
  return new RegExp(`^[ ]{0,3}${escapedCharacter}{${fence.length},}[ ]*$`).test(line);
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4}|\t)/.test(line);
}

function htmlBlockStart(line: string): HtmlBlock | null {
  const openingTag = /^[ ]{0,3}<(?:pre|script|style|textarea)(?:\s|>|$)/i.exec(line);
  if (openingTag !== null) {
    const tag = openingTag[0]!.replace(/^[^<]*</, "").split(/[\s>]/, 1)[0]!;
    return { kind: "closing-tag", tag };
  }
  if (/^[ ]{0,3}<!--/.test(line)) return { kind: "closing-sequence", sequence: "-->" };
  if (/^[ ]{0,3}<\?/.test(line)) return { kind: "closing-sequence", sequence: "?>" };
  if (/^[ ]{0,3}<!\[CDATA\[/.test(line)) return { kind: "closing-sequence", sequence: ']]>' };
  if (/^[ ]{0,3}<![A-Z]/.test(line)) return { kind: "until-blank" };
  if (/^[ ]{0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i.test(line)) {
    return { kind: "until-blank" };
  }
  if (/^[ ]{0,3}<[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>|$)/.test(line)) return { kind: "until-blank" };
  return null;
}

function htmlBlockEnds(line: string, block: HtmlBlock): boolean {
  switch (block.kind) {
    case "closing-tag":
      return new RegExp(`</${block.tag}\\s*>`, "i").test(line);
    case "closing-sequence":
      return line.includes(block.sequence);
    case "until-blank":
      return line === "";
  }
}

function isEmptyListItemPlaceholder(line: string): boolean {
  return /^[\t ]*[-+*][\t ]+<br\s*\/?\s*>[\t ]*$/i.test(line);
}

function isEmptyParagraphPlaceholder(line: string): boolean {
  return /^[\t ]*<br\s*\/?\s*>[\t ]*$/i.test(line);
}

function collapseBlankLines(lines: readonly MarkdownLine[]): readonly MarkdownLine[] {
  return lines.filter((line, index) => {
    const previous = lines[index - 1];
    return line.value !== "" || previous?.value !== "" || line.protected || previous.protected;
  });
}
