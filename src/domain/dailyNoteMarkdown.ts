export function hasDailyNoteContent(markdown: string): boolean {
  return markdown.trim().length > 0;
}

export function normalizeDailyNoteMarkdown(markdown: string): string {
  return hasDailyNoteContent(markdown) ? markdown : "";
}
