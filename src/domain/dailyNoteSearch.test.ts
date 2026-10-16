import { dailyNoteMatchesSearch, dailyNoteSearchTerms, inDailyNoteSearchRange, validateDailyNoteSearch } from "./dailyNoteSearch";

describe("Daily Note search", () => {
  it("groups phrases and validates empty queries, unmatched quotes, and dates", () => {
    expect(dailyNoteSearchTerms('one "two words" blåbær')).toEqual(["one", '"two words"', "blåbær"]);
    for (const query of ["", "  ", '""', '"unfinished']) {
      expect(() => validateDailyNoteSearch({ query })).toThrow();
    }
    expect(() => validateDailyNoteSearch({ query: "x", startDate: "2030-02-30" })).toThrow("valid dates");
  });
  it("uses an inclusive start and exclusive end, including an empty same-day range", () => {
    const date = "2030-02-02";
    expect(inDailyNoteSearchRange(date, { query: "x" })).toBe(true);
    expect(inDailyNoteSearchRange(date, { query: "x", startDate: date })).toBe(true);
    expect(inDailyNoteSearchRange(date, { query: "x", endDate: date })).toBe(false);
    expect(inDailyNoteSearchRange(date, { query: "x", startDate: date, endDate: date })).toBe(false);
    expect(inDailyNoteSearchRange(date, { query: "x", startDate: "2030-02-03" })).toBe(false);
    expect(inDailyNoteSearchRange(date, { query: "x", endDate: "2030-02-01" })).toBe(false);
  });
});

it("filters modified timestamps by the local calendar date and excludes unknown bounded dates", () => {
  const localMidnight = new Date(2030, 1, 2, 0, 0).toISOString();
  const lateLocal = new Date(2030, 1, 2, 23, 59).toISOString();
  const input = { query: "x", dateBasis: "modified" as const, startDate: "2030-02-02" as const, endDate: "2030-02-03" as const };
  expect(inDailyNoteSearchRange("2020-01-01", input, localMidnight)).toBe(true);
  expect(inDailyNoteSearchRange("2020-01-01", input, lateLocal)).toBe(true);
  expect(inDailyNoteSearchRange("2020-01-01", input, new Date(2030, 1, 3, 0, 0).toISOString())).toBe(false);
  expect(inDailyNoteSearchRange("2030-02-02", input)).toBe(false);
  expect(inDailyNoteSearchRange("2030-02-02", { query: "x", dateBasis: "modified" })).toBe(true);
});

it("requires all words or quoted phrases before reusing a current-note snapshot", () => {
  expect(dailyNoteMatchesSearch("Blue **berry** and APPLES", '"blue berry" apples')).toBe(true);
  expect(dailyNoteMatchesSearch("blue berries", "blue apples")).toBe(false);
  expect(dailyNoteMatchesSearch("pineapple", "apple")).toBe(false);
});
