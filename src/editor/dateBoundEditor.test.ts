import type { SyncStatus } from "~/storage/types";
import {
  applyCleanDailyNoteRefreshResult,
  applyEditorChange,
  applyLoadedDailyNoteResult,
  applySyncResult,
  canApplyEditorAsyncResult,
  canEditSelectedDate,
  captureVisibleDailyNoteSnapshot,
  createCleanDailyNoteRefreshRequest,
  resetSelectedDailyNoteSession,
  type DateBoundEditorState
} from "./dateBoundEditor";

describe("date-bound editor session", () => {
  it("resets visible editor state when selecting a new date", () => {
    expect(resetSelectedDailyNoteSession(state({ selectedDate: "2030-02-01", loadedDate: "2030-02-01" }), "2030-02-02")).toEqual({
      state: {
        selectedDate: "2030-02-02",
        loadedDate: null,
        markdown: "",
        cleanMarkdown: null,
        editorChangeEpoch: 0
      },
      markdownWrite: {
        source: "storage",
        markdown: ""
      }
    });
  });

  it("does not show the editor until the selected date has loaded", () => {
    expect(canEditSelectedDate(state({ selectedDate: "2030-02-01", loadedDate: null }))).toBe(false);
    expect(canEditSelectedDate(state({ selectedDate: "2030-02-01", loadedDate: "2030-02-01" }))).toBe(true);
  });

  it("ignores stale note loads after the selected date changes", () => {
    expect(
      applyLoadedDailyNoteResult(
        state({ selectedDate: "2030-02-02", loadedDate: null }),
        "2030-02-01",
        session("loaded A", "synced")
      )
    ).toBeNull();

    expect(
      applyLoadedDailyNoteResult(
        state({ selectedDate: "2030-02-02", loadedDate: null }),
        "2030-02-02",
        session("loaded B", "synced")
      )
    ).toMatchObject({
      state: {
        loadedDate: "2030-02-02",
        markdown: "loaded B",
        cleanMarkdown: "loaded B"
      },
      markdownWrite: {
        source: "storage",
        markdown: "loaded B"
      }
    });
  });

  it("captures autosave and sync snapshots with an explicit date and markdown", () => {
    expect(captureVisibleDailyNoteSnapshot(state({ selectedDate: "2030-02-02", loadedDate: null }))).toBeNull();
    expect(
      captureVisibleDailyNoteSnapshot(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible markdown"
        })
      )
    ).toEqual({
      date: "2030-02-02",
      markdown: "visible markdown"
    });
  });

  it("applies current editor changes and clears clean markdown", () => {
    expect(
      applyEditorChange(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "clean",
          cleanMarkdown: "clean",
          editorChangeEpoch: 2
        }),
        "2030-02-02",
        "edited"
      )
    ).toEqual({
      type: "current-editor",
      state: {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02",
        markdown: "edited",
        cleanMarkdown: null,
        editorChangeEpoch: 3
      },
      markdownWrite: {
        source: "editor",
        markdown: "edited"
      }
    });
  });

  it("routes stale editor changes to background save without mutating visible markdown", () => {
    expect(
      applyEditorChange(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible",
          cleanMarkdown: "visible",
          editorChangeEpoch: 4
        }),
        "2030-02-01",
        "stale edit"
      )
    ).toEqual({
      type: "stale-editor",
      state: {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02",
        markdown: "visible",
        cleanMarkdown: "visible",
        editorChangeEpoch: 4
      },
      backgroundSave: {
        date: "2030-02-01",
        markdown: "stale edit"
      }
    });
  });

  it("ignores clean refreshes after the user edits", () => {
    const cleanState = state({
      selectedDate: "2030-02-02",
      loadedDate: "2030-02-02",
      markdown: "clean",
      cleanMarkdown: "clean",
      editorChangeEpoch: 1
    });
    const request = createCleanDailyNoteRefreshRequest(cleanState, "2030-02-02");
    const editResult = applyEditorChange(cleanState, "2030-02-02", "local edit");

    expect(request).toEqual({
      date: "2030-02-02",
      cleanMarkdown: "clean",
      editorChangeEpoch: 1,
      markdown: "clean"
    });
    expect(editResult.type).toBe("current-editor");
    expect(applyCleanDailyNoteRefreshResult(editResult.state, request!, session("remote", "synced"))).toBeNull();
  });

  it("does not apply stale sync conflicts to the visible Daily Note", () => {
    expect(
      applySyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible"
        }),
        { date: "2030-02-01", markdown: "old snapshot" },
        session("<<<<<<< conflict", "conflict")
      )
    ).toBeNull();
  });

  it("applies current sync markdown only from the captured snapshot", () => {
    expect(
      applySyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "old snapshot"
        }),
        { date: "2030-02-02", markdown: "old snapshot" },
        session("remote saved", "synced")
      )
    ).toMatchObject({
      state: {
        markdown: "remote saved",
        cleanMarkdown: "remote saved"
      },
      markdownWrite: {
        source: "storage",
        markdown: "remote saved"
      }
    });

    expect(
      applySyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "newer local edit"
        }),
        { date: "2030-02-02", markdown: "old snapshot" },
        session("remote saved", "synced")
      )
    ).toEqual({
      state: {
        selectedDate: "2030-02-02",
        loadedDate: "2030-02-02",
        markdown: "newer local edit",
        cleanMarkdown: "remote saved",
        editorChangeEpoch: 0
      }
    });

    expect(
      applySyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "newer local edit"
        }),
        { date: "2030-02-02", markdown: "old snapshot" },
        session("<<<<<<< conflict", "conflict")
      )
    ).toBeNull();

    expect(
      applySyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "old snapshot"
        }),
        { date: "2030-02-02", markdown: "old snapshot" },
        session("<<<<<<< conflict", "conflict")
      )
    ).toMatchObject({
      state: {
        markdown: "<<<<<<< conflict",
        cleanMarkdown: null
      },
      markdownWrite: {
        source: "storage",
        markdown: "<<<<<<< conflict"
      }
    });
  });

  it("does not apply async editor mutations after date navigation", () => {
    expect(
      canApplyEditorAsyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02"
        }),
        "2030-02-01"
      )
    ).toBe(false);
    expect(
      canApplyEditorAsyncResult(
        state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02"
        }),
        "2030-02-02"
      )
    ).toBe(true);
  });
});

function state(overrides: Partial<DateBoundEditorState>): DateBoundEditorState {
  return {
    selectedDate: null,
    loadedDate: null,
    markdown: "",
    cleanMarkdown: null,
    editorChangeEpoch: 0,
    ...overrides
  };
}

function session(markdown: string, status: SyncStatus): { readonly markdown: string; readonly status: SyncStatus } {
  return { markdown, status };
}
