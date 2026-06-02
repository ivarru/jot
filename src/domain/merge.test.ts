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

  it("creates Git-style conflict markers around only changed lines", () => {
    expect(
      mergeDailyNote({
        baseline: "before\nold\nsame\nafter\n",
        local: "before\nlocal\nsame\nafter\n",
        remote: "before\nremote\nsame\nafter\n"
      })
    ).toEqual({
      merged: "before\n<<<<<<< Local Draft\nlocal\n=======\nremote\n>>>>>>> Google Drive\nsame\nafter\n",
      conflicted: true
    });
  });

  it("merges non-overlapping local edits and remote edits from the same baseline", () => {
    expect(
      mergeDailyNote({
        baseline: "Title old\nbody\n",
        local: "Title old\nbody \n",
        remote: "Title new\nbody\n"
      })
    ).toEqual({
      merged: "Title new\nbody \n",
      conflicted: false
    });
  });

  it("limits conflicts to overlapping local and remote edits", () => {
    expect(
      mergeDailyNote({
        baseline: "before\nold\nsame\nafter\n",
        local: "before\nlocal\nsame \nafter\n",
        remote: "before\nremote\nsame\nafter\n"
      })
    ).toEqual({
      merged: "before\n<<<<<<< Local Draft\nlocal\n=======\nremote\n>>>>>>> Google Drive\nsame \nafter\n",
      conflicted: true
    });
  });

  it("uses a line diff for multiple separated conflict hunks", () => {
    expect(
      createConflictMarkdown(
        "keep 1\nlocal 1\nkeep 2\nlocal 2\nkeep 3\n",
        "keep 1\nremote 1\nkeep 2\nremote 2\nkeep 3\n"
      )
    ).toBe(
      "keep 1\n" +
        "<<<<<<< Local Draft\nlocal 1\n=======\nremote 1\n>>>>>>> Google Drive\n" +
        "keep 2\n" +
        "<<<<<<< Local Draft\nlocal 2\n=======\nremote 2\n>>>>>>> Google Drive\n" +
        "keep 3\n"
    );
  });
});
