import { createConflictMarkdown, mergeDailyNote } from "./merge";

describe("daily note merge", () => {
  it("keeps local when remote did not change", () => {
    expect(mergeDailyNote({ baseline: "a", local: "ab", remote: "a" })).toEqual({
      merged: "ab",
      conflicted: false
    });
  });

  it("keeps remote when local did not change", () => {
    expect(mergeDailyNote({ baseline: "a", local: "a", remote: "ac" })).toEqual({
      merged: "ac",
      conflicted: false
    });
  });

  it("creates Git-style conflict markers when both sides changed", () => {
    expect(mergeDailyNote({ baseline: "a\n", local: "local\n", remote: "remote\n" })).toEqual({
      merged: createConflictMarkdown("local\n", "remote\n"),
      conflicted: true
    });
  });
});
