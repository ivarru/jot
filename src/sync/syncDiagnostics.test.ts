import { describe, expect, it } from "vitest";
import {
  formatSyncDiagnostics,
  SYNC_DIAGNOSTIC_RETENTION_MS,
  SyncDiagnosticsBuffer
} from "./syncDiagnostics";

describe("SyncDiagnosticsBuffer", () => {
  it("is disabled by default and clears retained events when disabled", () => {
    const diagnostics = new SyncDiagnosticsBuffer(() => 1_000);
    diagnostics.record({ event: "sync-requested", markdown: "private note" });
    expect(diagnostics.snapshot()).toEqual([]);

    diagnostics.setEnabled(true);
    diagnostics.record({ event: "sync-requested", date: "2030-02-02", markdown: "private note" });
    expect(diagnostics.snapshot()).toHaveLength(1);

    diagnostics.setEnabled(false);
    expect(diagnostics.snapshot()).toEqual([]);
  });

  it("redacts Markdown and raw revision identifiers from copied diagnostics", () => {
    const diagnostics = new SyncDiagnosticsBuffer(() => 1_000);
    diagnostics.setEnabled(true);
    diagnostics.record({
      event: "sync-requested",
      date: "2030-02-02",
      source: "autosave",
      markdown: "private note",
      expectedRevisionId: "private-old-revision",
      revisionId: "private-new-revision"
    });

    const copied = formatSyncDiagnostics(diagnostics.snapshot(), "0.25.0-test");
    expect(copied).toContain("Jot 0.25.0-test sync diagnostics");
    expect(copied).not.toContain("diagnostics v1");
    expect(copied).toContain('"length":12');
    expect(copied).toContain('"expectedRevisionHash"');
    expect(copied).not.toContain("private note");
    expect(copied).not.toContain("private-old-revision");
    expect(copied).not.toContain("private-new-revision");
  });

  it("pauses appending during a conflict while retaining the preceding minute", () => {
    let now = 1_000;
    const diagnostics = new SyncDiagnosticsBuffer(() => now);
    diagnostics.setEnabled(true);
    diagnostics.record({ event: "sync-requested", source: "background" });
    diagnostics.setPaused(true);
    now += 1;
    diagnostics.record({ event: "editor-change", markdown: "must not be recorded" });
    expect(diagnostics.snapshot().map((event) => event.event)).toEqual(["sync-requested"]);

    now += SYNC_DIAGNOSTIC_RETENTION_MS + 1;
    expect(diagnostics.snapshot().map((event) => event.event)).toEqual(["sync-requested"]);

    diagnostics.setPaused(false);
    diagnostics.record({ event: "sync-requested", source: "manual" });
    expect(diagnostics.snapshot().map((event) => event.event)).toEqual(["sync-requested"]);
  });
});
