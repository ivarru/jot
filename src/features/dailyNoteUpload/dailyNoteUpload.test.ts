import {
  buildDailyNoteUploadCandidates,
  createPendingDailyNoteUpload,
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

  it("builds upload candidates from valid uploaded files", () => {
    expect(buildDailyNoteUploadCandidates([
      { filename: "2030-02-02.md", markdown: "first" },
      { filename: "2030-02-03.md", markdown: "second" }
    ])).toEqual([
      {
        date: "2030-02-02",
        filename: "2030-02-02.md",
        uploadedMarkdown: "first"
      },
      {
        date: "2030-02-03",
        filename: "2030-02-03.md",
        uploadedMarkdown: "second"
      }
    ]);
  });

  it("rejects upload candidates with invalid filenames", () => {
    expect(() => buildDailyNoteUploadCandidates([
      { filename: "notes.md", markdown: "content" }
    ])).toThrow("Daily Note files must be named YYYY-MM-DD.md. Invalid: notes.md");
  });

  it("rejects duplicate dates in one upload batch", () => {
    expect(() => buildDailyNoteUploadCandidates([
      { filename: "2030-02-02.md", markdown: "first" },
      { filename: "2030-02-02.md", markdown: "second" }
    ])).toThrow("Only one uploaded file per Daily Note date is allowed. Duplicates: 2030-02-02.md");
  });

  it("counts pending upload conflicts", () => {
    expect(createPendingDailyNoteUpload([
      {
        date: "2030-02-02",
        filename: "2030-02-02.md",
        uploadedMarkdown: "new",
        existingMarkdown: "existing"
      },
      {
        date: "2030-02-03",
        filename: "2030-02-03.md",
        uploadedMarkdown: "new",
        existingMarkdown: null
      }
    ])).toEqual({
      conflictCount: 1,
      items: [
        {
          date: "2030-02-02",
          filename: "2030-02-02.md",
          uploadedMarkdown: "new",
          existingMarkdown: "existing"
        },
        {
          date: "2030-02-03",
          filename: "2030-02-03.md",
          uploadedMarkdown: "new",
          existingMarkdown: null
        }
      ]
    });
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
