import { dateToFilename, parseIsoDate, type IsoDate } from "./dates";

export type DailyNoteUploadConflictResolution = "prepend" | "append" | "replace";

export interface UploadedDailyNoteFile {
  readonly filename: string;
  readonly markdown: string;
}

export interface DailyNoteUploadCandidate {
  readonly date: IsoDate;
  readonly filename: string;
  readonly uploadedMarkdown: string;
}

export interface DailyNoteUploadPlanItem extends DailyNoteUploadCandidate {
  readonly existingMarkdown: string | null;
}

export interface PendingDailyNoteUpload {
  readonly items: readonly DailyNoteUploadPlanItem[];
  readonly conflictCount: number;
}

export function parseDailyNoteUploadFilename(filename: string): IsoDate | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(filename);
  if (match === null) return null;

  const date = parseIsoDate(match[1] ?? "");
  return date !== null && filename === dateToFilename(date) ? date : null;
}

export function buildDailyNoteUploadCandidates(files: readonly UploadedDailyNoteFile[]): DailyNoteUploadCandidate[] {
  const seenDates = new Set<IsoDate>();
  const invalidFilenames: string[] = [];
  const duplicateFilenames: string[] = [];
  const candidates: DailyNoteUploadCandidate[] = [];

  for (const file of files) {
    const date = parseDailyNoteUploadFilename(file.filename);
    if (date === null) {
      invalidFilenames.push(file.filename);
      continue;
    }
    if (seenDates.has(date)) {
      duplicateFilenames.push(file.filename);
      continue;
    }
    seenDates.add(date);
    candidates.push({
      date,
      filename: file.filename,
      uploadedMarkdown: file.markdown
    });
  }

  if (invalidFilenames.length > 0) {
    throw new Error(`Daily Note files must be named YYYY-MM-DD.md. Invalid: ${invalidFilenames.join(", ")}`);
  }
  if (duplicateFilenames.length > 0) {
    throw new Error(`Only one uploaded file per Daily Note date is allowed. Duplicates: ${duplicateFilenames.join(", ")}`);
  }

  return candidates;
}

export function createPendingDailyNoteUpload(items: readonly DailyNoteUploadPlanItem[]): PendingDailyNoteUpload {
  return {
    items,
    conflictCount: items.filter((item) => item.existingMarkdown !== null).length
  };
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
