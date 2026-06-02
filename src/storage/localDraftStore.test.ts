import { createDraft, isExistingDailyNoteDraft } from "./localDraftStore";

describe("Local Draft note existence", () => {
  it("does not count an unedited local-only empty draft as an existing note", () => {
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "", "", null, false))).toBe(false);
  });

  it("counts non-empty, remote-backed, or dirty drafts as existing notes", () => {
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "local", "", null, false))).toBe(true);
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "", "", "revision-1", false))).toBe(true);
    expect(isExistingDailyNoteDraft(createDraft("2030-02-01", "", "remote", "revision-1", true))).toBe(true);
  });
});
