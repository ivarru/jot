import {
  addDays,
  dateToFilename,
  dayOfWeek,
  millisecondsUntilNextLocalDay,
  parseIsoDate,
  toIsoDate
} from "./dates";

describe("date helpers", () => {
  it("formats browser-local dates as ISO dates", () => {
    expect(toIsoDate(new Date(2026, 4, 27))).toBe("2026-05-27");
  });

  it("rejects invalid dates instead of coercing them", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-2-3")).toBeNull();
  });

  it("maps daily note dates to markdown filenames", () => {
    expect(dateToFilename("2026-05-27")).toBe("2026-05-27.md");
  });

  it("navigates dates in local calendar days", () => {
    expect(addDays("2026-05-27", 1)).toBe("2026-05-28");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("reports the weekday", () => {
    expect(dayOfWeek("2026-05-27", "en-US")).toBe("Wed");
    expect(dayOfWeek("2026-05-27", "en-US", "long")).toBe("Wednesday");
  });

  it("calculates the delay until the next local day", () => {
    expect(millisecondsUntilNextLocalDay(new Date(2030, 1, 2, 12, 0, 0, 0))).toBe(12 * 60 * 60 * 1000);
    expect(millisecondsUntilNextLocalDay(new Date(2030, 1, 2, 23, 59, 59, 500))).toBe(500);
    expect(millisecondsUntilNextLocalDay(new Date(2030, 1, 3, 0, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });
});
