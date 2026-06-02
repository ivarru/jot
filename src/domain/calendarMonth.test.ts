import { addMonths, calendarMonth, monthLabel, monthOfIsoDate } from "./calendarMonth";

describe("calendar month helpers", () => {
  it("maps dates to year-month values", () => {
    expect(monthOfIsoDate("2030-02-14")).toBe("2030-02");
  });

  it("navigates months across year boundaries", () => {
    expect(addMonths("2030-01", -1)).toBe("2029-12");
    expect(addMonths("2030-12", 1)).toBe("2031-01");
  });

  it("formats month labels", () => {
    expect(monthLabel("2030-02", "en-US")).toBe("February 2030");
  });

  it("builds Monday-first calendar weeks", () => {
    const month = calendarMonth("2030-02");

    expect(month.weeks[0]?.map((day) => day?.date ?? null)).toEqual([
      null,
      null,
      null,
      null,
      "2030-02-01",
      "2030-02-02",
      "2030-02-03"
    ]);
    expect(month.weeks.at(-1)?.at(-1)).toBeNull();
  });
});
