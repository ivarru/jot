/**
 * Canonical browser-local calendar date in YYYY-MM-DD form.
 *
 * IsoDate values identify local calendar days, not instants. Values produced by
 * this module are canonical, so two IsoDate values are equal iff their string
 * values are equal with ===.
 */
export type IsoDate = `${number}-${number}-${number}`;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as IsoDate;
}

export function todayIsoDate(now = new Date()): IsoDate {
  return toIsoDate(now);
}

export function millisecondsUntilNextLocalDay(now = new Date()): number {
  const nextLocalDay = new Date(now);
  nextLocalDay.setHours(24, 0, 0, 0);
  return nextLocalDay.getTime() - now.getTime();
}

export function parseIsoDate(value: string): IsoDate | null {
  if (!ISO_DATE_PATTERN.test(value)) return null;

  const [yearText, monthText, dayText] = splitIsoDate(value);
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return value as IsoDate;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = splitIsoDate(date).map(Number) as [number, number, number];
  const parsed = new Date(year, month - 1, day);
  parsed.setDate(parsed.getDate() + days);
  return toIsoDate(parsed);
}

export function dateToFilename(date: IsoDate): `${IsoDate}.md` {
  return `${date}.md`;
}

export function dayOfWeek(date: IsoDate, locale = undefined as string | undefined): string {
  const [year, month, day] = splitIsoDate(date).map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(year, month - 1, day));
}

export function isToday(date: IsoDate, now = new Date()): boolean {
  return date === todayIsoDate(now);
}

function splitIsoDate(date: string): [string, string, string] {
  const parts = date.split("-");
  return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""];
}
