import { addDays, toIsoDate, type IsoDate } from "./dates";

export type YearMonth = `${number}-${number}`;

export interface CalendarDay {
  readonly date: IsoDate;
  readonly dayOfMonth: number;
}

export interface CalendarMonth {
  readonly month: YearMonth;
  readonly weeks: ReadonlyArray<ReadonlyArray<CalendarDay | null>>;
}

export const CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function monthOfIsoDate(date: IsoDate): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

export function addMonths(month: YearMonth, months: number): YearMonth {
  const [year, monthNumber] = splitYearMonth(month);
  return toYearMonth(new Date(year, monthNumber - 1 + months, 1));
}

export function monthLabel(month: YearMonth, locale?: string): string {
  const [year, monthNumber] = splitYearMonth(month);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

export function calendarMonth(month: YearMonth): CalendarMonth {
  const [year, monthNumber] = splitYearMonth(month);
  const firstDate = toIsoDate(new Date(year, monthNumber - 1, 1));
  const firstWeekdayOffset = mondayFirstWeekdayOffset(new Date(year, monthNumber - 1, 1));
  const lastDayOfMonth = new Date(year, monthNumber, 0).getDate();
  const cells: Array<CalendarDay | null> = [];

  for (let index = 0; index < firstWeekdayOffset; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= lastDayOfMonth; day += 1) {
    const date = addDays(firstDate, day - 1);
    cells.push({ date, dayOfMonth: day });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: Array<ReadonlyArray<CalendarDay | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return {
    month,
    weeks
  };
}

function splitYearMonth(month: YearMonth): [number, number] {
  const [yearText, monthText] = month.split("-");
  return [Number(yearText), Number(monthText)];
}

function toYearMonth(date: Date): YearMonth {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}` as YearMonth;
}

function mondayFirstWeekdayOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}
