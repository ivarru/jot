import { dateToFilename, parseIsoDate, type IsoDate } from "./dates";

export type DailyNoteUploadConflictResolution = "prepend" | "append" | "replace";

export function parseDailyNoteUploadFilename(filename: string): IsoDate | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(filename);
  if (match === null) return null;

  const date = parseIsoDate(match[1] ?? "");
  return date !== null && filename === dateToFilename(date) ? date : null;
}

export function dailyNoteUploadMarkdown(input: {
  readonly existingMarkdown: string;
  readonly uploadedMarkdown: string;
  readonly resolution: DailyNoteUploadConflictResolution;
}): string {
  switch (input.resolution) {
    case "prepend":
      return joinDailyNoteMarkdown(input.uploadedMarkdown, input.existingMarkdown);
    case "append":
      return joinDailyNoteMarkdown(input.existingMarkdown, input.uploadedMarkdown);
    case "replace":
      return input.uploadedMarkdown;
  }
}

function joinDailyNoteMarkdown(first: string, second: string): string {
  if (first.length === 0) return second;
  if (second.length === 0) return first;
  return `${first}${markdownSeparator(first, second)}${second}`;
}

function markdownSeparator(first: string, second: string): string {
  if (first.endsWith("\n\n") || second.startsWith("\n\n")) return "";
  if (first.endsWith("\n") || second.startsWith("\n")) return "\n";
  return "\n\n";
}
