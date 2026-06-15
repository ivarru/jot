export interface MarkdownHardLineBreakSpaceRange {
  readonly start: number;
  readonly end: number;
}

export function markdownHardLineBreakSpaceRanges(markdown: string): readonly MarkdownHardLineBreakSpaceRange[] {
  const ranges: MarkdownHardLineBreakSpaceRange[] = [];
  let lineStart = 0;

  while (lineStart <= markdown.length) {
    const newlineIndex = markdown.indexOf("\n", lineStart);
    const lineEnd =
      newlineIndex === -1
        ? markdown.length
        : newlineIndex > lineStart && markdown[newlineIndex - 1] === "\r"
          ? newlineIndex - 1
          : newlineIndex;
    let spaceStart = lineEnd;

    while (spaceStart > lineStart && markdown.charCodeAt(spaceStart - 1) === 32) {
      spaceStart -= 1;
    }

    if (newlineIndex !== -1 && lineEnd - spaceStart >= 2) {
      ranges.push({ start: spaceStart, end: lineEnd });
    }

    if (newlineIndex === -1) break;
    lineStart = newlineIndex + 1;
  }

  return ranges;
}
