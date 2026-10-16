import { parseIsoDate, toIsoDate, type IsoDate } from "./dates";

export interface DailyNoteSearch {
  readonly query: string;
  readonly startDate?: IsoDate;
  readonly endDate?: IsoDate;
  readonly dateBasis?: "note" | "modified";
}

/** Metadata from the remote search response; null means the provider omitted it. */
export interface DailyNoteSearchResult {
  readonly date: IsoDate;
  readonly fileId: string;
  readonly modifiedTime: string | null;
  readonly sizeBytes: string | null;
}

export function validateDailyNoteSearch(input: DailyNoteSearch): void {
  if (!input.query.replaceAll('"', "").trim()) throw new Error("Enter words to search for.");
  if ((input.query.match(/"/g)?.length ?? 0) % 2) throw new Error("Close the quotation marks around your phrase.");
  if ((input.startDate && !parseIsoDate(input.startDate)) || (input.endDate && !parseIsoDate(input.endDate))) {
    throw new Error("Enter valid dates.");
  }
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    throw new Error("End date must be on or after start date.");
  }
}

/** Unquoted words are ANDed; double quotes group an exact phrase. */
export function dailyNoteSearchTerms(query: string): string[] {
  return Array.from(query.matchAll(/"([^"]+)"|(\S+)/g), (match) => match[1] === undefined ? match[2]! : `"${match[1]}"`);
}

export function inDailyNoteSearchRange(date: IsoDate, input: DailyNoteSearch, modifiedTime?: string): boolean {
  if (!input.startDate && !input.endDate) return true;
  if (input.dateBasis === "modified") {
    const instant = new Date(modifiedTime ?? "");
    if (!Number.isFinite(instant.getTime())) return false;
    date = toIsoDate(instant);
  }
  return (!input.startDate || date >= input.startDate) && (!input.endDate || date < input.endDate);
}

/** Display a remote instant using the user's current browser-local calendar and clock. */
export function formatSearchModifiedTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${toIsoDate(date)} ${hours}:${minutes}`;
}

/** Check every search term against a local snapshot before reusing it as a preview. */
export function dailyNoteMatchesSearch(markdown: string, query: string): boolean {
  const words = markdown.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  const terms = dailyNoteSearchTerms(query);
  return terms.length > 0 && terms.every((term) => {
    const sought = term.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
    return sought.length > 0 && words.some((_, index) => sought.every((word, offset) => words[index + offset] === word));
  });
}
