import {
  canEditSelectedDate,
  editorChangeTarget,
  shouldApplyEditorAsyncResult,
  shouldApplyLoadedNote,
  shouldApplySyncResult
} from "./dateBoundEditor";

describe("date-bound editor guards", () => {
  it("does not show the editor until the selected date has loaded", () => {
    expect(canEditSelectedDate({ selectedDate: "2030-02-01", loadedDate: null })).toBe(false);
    expect(canEditSelectedDate({ selectedDate: "2030-02-01", loadedDate: "2030-02-01" })).toBe(true);
  });

  it("ignores stale note loads after the selected date changes", () => {
    expect(shouldApplyLoadedNote("2030-02-01", "2030-02-02")).toBe(false);
    expect(shouldApplyLoadedNote("2030-02-02", "2030-02-02")).toBe(true);
  });

  it("routes editor changes from old document instances away from the current markdown signal", () => {
    expect(
      editorChangeTarget("2030-02-01", {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02"
      })
    ).toBe("stale-editor");
    expect(
      editorChangeTarget("2030-02-02", {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02"
      })
    ).toBe("current-editor");
  });

  it("does not apply stale sync results to the visible editor", () => {
    expect(shouldApplySyncResult("2030-02-01", "2030-02-02")).toBe(false);
    expect(shouldApplySyncResult("2030-02-02", "2030-02-02")).toBe(true);
  });

  it("does not apply async editor mutations after date navigation", () => {
    expect(
      shouldApplyEditorAsyncResult("2030-02-01", {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02"
      })
    ).toBe(false);
    expect(
      shouldApplyEditorAsyncResult("2030-02-02", {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02"
      })
    ).toBe(true);
  });

  it("does not apply async image attachment mutations after date navigation", () => {
    const attachmentDate = "2030-02-01";
    expect(
      shouldApplyEditorAsyncResult(attachmentDate, {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02"
      })
    ).toBe(false);
  });
});
