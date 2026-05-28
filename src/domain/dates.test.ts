import { addDays, dateToFilename, dayOfWeek, parseIsoDate, toIsoDate } from "./dates";

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
    expect(dayOfWeek("2026-05-27", "en-US")).toBe("Wednesday");
  });
});
