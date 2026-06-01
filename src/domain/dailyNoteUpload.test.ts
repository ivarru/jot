import {
  dailyNoteUploadMarkdown,
  parseDailyNoteUploadFilename,
  type DailyNoteUploadConflictResolution
} from "./dailyNoteUpload";

describe("daily note upload", () => {
  it("accepts canonical daily note markdown filenames", () => {
    expect(parseDailyNoteUploadFilename("2030-02-02.md")).toBe("2030-02-02");
  });

  it("rejects non-canonical or non-markdown filenames", () => {
    expect(parseDailyNoteUploadFilename("2030-2-2.md")).toBeNull();
    expect(parseDailyNoteUploadFilename("2030-02-30.md")).toBeNull();
    expect(parseDailyNoteUploadFilename("2030-02-02.txt")).toBeNull();
    expect(parseDailyNoteUploadFilename("notes/2030-02-02.md")).toBeNull();
  });

  it.each([
    ["prepend", "uploaded\n\nexisting"],
    ["append", "existing\n\nuploaded"],
    ["replace", "uploaded"]
  ] satisfies ReadonlyArray<readonly [DailyNoteUploadConflictResolution, string]>)(
    "resolves existing notes with %s",
    (resolution, expected) => {
      expect(dailyNoteUploadMarkdown({
        existingMarkdown: "existing",
        uploadedMarkdown: "uploaded",
        resolution
      })).toBe(expected);
    }
  );

  it("does not add separators around empty markdown while merging", () => {
    expect(dailyNoteUploadMarkdown({
      existingMarkdown: "",
      uploadedMarkdown: "uploaded",
      resolution: "append"
    })).toBe("uploaded");
    expect(dailyNoteUploadMarkdown({
      existingMarkdown: "existing",
      uploadedMarkdown: "",
      resolution: "prepend"
    })).toBe("existing");
  });
});
