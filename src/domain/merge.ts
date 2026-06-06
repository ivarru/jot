import { diffLines, type Change } from "diff";

export interface MergeInput {
  readonly baseline: string;
  readonly local: string;
  readonly remote: string;
}

export interface UnresolvedMergeHunk {
  readonly localMarkdown: string;
  readonly remoteMarkdown: string;
}

export interface MergeResolutionChoices {
  readonly thisDevice: string;
  readonly googleDrive: string;
  readonly thisDeviceForUnresolved: string | null;
  readonly googleDriveForUnresolved: string | null;
}

export interface MergeResult {
  readonly mergedMarkdown: string;
  readonly unresolvedHunks: readonly UnresolvedMergeHunk[];
  readonly choices: MergeResolutionChoices;
  readonly manualConflictMarkdown: string;
  /** @deprecated Use mergedMarkdown. */
  readonly merged: string;
  /** @deprecated Use unresolvedHunks.length > 0. */
  readonly conflicted: boolean;
}

export function mergeDailyNote(input: MergeInput): MergeResult {
  if (input.local === input.remote) {
    return cleanMergeResult(input, input.local);
  }

  if (input.local === input.baseline) {
    return cleanMergeResult(input, input.remote);
  }

  if (input.remote === input.baseline) {
    return cleanMergeResult(input, input.local);
  }

  const merged = tryAppendOnlyMerge(input);
  if (merged !== null) {
    return cleanMergeResult(input, merged);
  }

  return mergeLineChanges(input);
}

export function createConflictMarkdown(local: string, remote: string): string {
  return conflictHunksFromLineDiff(diffLines(local, remote));
}

export function containsDailyNoteConflictMarkers(markdown: string): boolean {
  return markdown.includes("<<<<<<< Local Draft\n") &&
    markdown.includes("=======\n") &&
    markdown.includes(">>>>>>> Google Drive\n");
}

function tryAppendOnlyMerge(input: MergeInput): string | null {
  if (!input.local.startsWith(input.baseline) || !input.remote.startsWith(input.baseline)) {
    return null;
  }

  const localTail = input.local.slice(input.baseline.length);
  const remoteTail = input.remote.slice(input.baseline.length);
  return `${input.baseline}${localTail}${remoteTail}`;
}

interface LineHunk {
  readonly start: number;
  readonly end: number;
  readonly replacement: readonly string[];
}

function mergeLineChanges(input: MergeInput): MergeResult {
  const baselineLines = splitLines(input.baseline);
  const localHunks = lineHunks(input.baseline, input.local);
  const remoteHunks = lineHunks(input.baseline, input.remote);
  let localIndex = 0;
  let remoteIndex = 0;
  let baselineIndex = 0;
  let manualConflictMarkdown = "";
  let thisDeviceForUnresolved = "";
  let googleDriveForUnresolved = "";
  const unresolvedHunks: UnresolvedMergeHunk[] = [];

  const appendResolved = (markdown: string) => {
    manualConflictMarkdown += markdown;
    thisDeviceForUnresolved += markdown;
    googleDriveForUnresolved += markdown;
  };

  while (localIndex < localHunks.length || remoteIndex < remoteHunks.length) {
    const localHunk = localHunks[localIndex];
    const remoteHunk = remoteHunks[remoteIndex];

    if (remoteHunk === undefined || (localHunk !== undefined && hunkComesBefore(localHunk, remoteHunk))) {
      const hunk = localHunk!;
      appendResolved(baselineLines.slice(baselineIndex, hunk.start).join(""));
      appendResolved(hunk.replacement.join(""));
      baselineIndex = hunk.end;
      localIndex += 1;
      continue;
    }

    if (localHunk === undefined || hunkComesBefore(remoteHunk, localHunk)) {
      appendResolved(baselineLines.slice(baselineIndex, remoteHunk.start).join(""));
      appendResolved(remoteHunk.replacement.join(""));
      baselineIndex = remoteHunk.end;
      remoteIndex += 1;
      continue;
    }

    const group = collectOverlappingHunks(localHunks, remoteHunks, localIndex, remoteIndex);
    localIndex = group.nextLocalIndex;
    remoteIndex = group.nextRemoteIndex;
    appendResolved(baselineLines.slice(baselineIndex, group.start).join(""));

    const localValue = applyHunksToRange(baselineLines, group.start, group.end, group.localHunks);
    const remoteValue = applyHunksToRange(baselineLines, group.start, group.end, group.remoteHunks);
    if (localValue === remoteValue) {
      appendResolved(localValue);
    } else if (allPureInsertions(group.localHunks)) {
      appendResolved(applyInsertionHunksToMarkdown(group.start, group.localHunks, remoteValue));
    } else {
      const hunk = { localMarkdown: localValue, remoteMarkdown: remoteValue };
      unresolvedHunks.push(hunk);
      manualConflictMarkdown += conflictHunk(localValue, remoteValue);
      thisDeviceForUnresolved += hunk.localMarkdown;
      googleDriveForUnresolved += hunk.remoteMarkdown;
    }
    baselineIndex = group.end;
  }

  appendResolved(baselineLines.slice(baselineIndex).join(""));
  return mergeResultFromParts(input, manualConflictMarkdown, unresolvedHunks, {
    thisDeviceForUnresolved,
    googleDriveForUnresolved
  });
}

function lineHunks(from: string, to: string): LineHunk[] {
  const baselineLines = splitLines(from);
  const hunks: LineHunk[] = [];
  let baselineIndex = 0;
  let pending: { start: number; end: number; replacement: string[] } | null = null;

  const flushPending = () => {
    if (pending === null) return;
    const replacedLineCount = pending.end - pending.start;
    if (replacedLineCount === pending.replacement.length) {
      for (let index = 0; index < replacedLineCount; index += 1) {
        const replacement = pending.replacement[index]!;
        if (baselineLines[pending.start + index] === replacement) continue;
        hunks.push({
          start: pending.start + index,
          end: pending.start + index + 1,
          replacement: [replacement]
        });
      }
    } else {
      hunks.push(pending);
    }
    pending = null;
  };

  for (const change of diffLines(from, to)) {
    const lines = splitLines(change.value);
    if (!change.added && !change.removed) {
      flushPending();
      baselineIndex += lines.length;
      continue;
    }

    pending ??= { start: baselineIndex, end: baselineIndex, replacement: [] };
    if (change.removed) {
      pending.end += lines.length;
      baselineIndex += lines.length;
    } else if (change.added) {
      pending.replacement.push(...lines);
    }
  }

  flushPending();
  return hunks;
}

function collectOverlappingHunks(
  localHunks: readonly LineHunk[],
  remoteHunks: readonly LineHunk[],
  localIndex: number,
  remoteIndex: number
): {
  readonly start: number;
  readonly end: number;
  readonly localHunks: readonly LineHunk[];
  readonly remoteHunks: readonly LineHunk[];
  readonly nextLocalIndex: number;
  readonly nextRemoteIndex: number;
} {
  let start = Math.min(localHunks[localIndex]!.start, remoteHunks[remoteIndex]!.start);
  let end = Math.max(localHunks[localIndex]!.end, remoteHunks[remoteIndex]!.end);
  const localGroup: LineHunk[] = [];
  const remoteGroup: LineHunk[] = [];
  let nextLocalIndex = localIndex;
  let nextRemoteIndex = remoteIndex;
  let added = true;

  while (added) {
    added = false;
    while (nextLocalIndex < localHunks.length && hunkOverlapsRange(localHunks[nextLocalIndex]!, start, end)) {
      const hunk = localHunks[nextLocalIndex]!;
      localGroup.push(hunk);
      start = Math.min(start, hunk.start);
      end = Math.max(end, hunk.end);
      nextLocalIndex += 1;
      added = true;
    }

    while (nextRemoteIndex < remoteHunks.length && hunkOverlapsRange(remoteHunks[nextRemoteIndex]!, start, end)) {
      const hunk = remoteHunks[nextRemoteIndex]!;
      remoteGroup.push(hunk);
      start = Math.min(start, hunk.start);
      end = Math.max(end, hunk.end);
      nextRemoteIndex += 1;
      added = true;
    }
  }

  return {
    start,
    end,
    localHunks: localGroup,
    remoteHunks: remoteGroup,
    nextLocalIndex,
    nextRemoteIndex
  };
}

function applyHunksToRange(
  baselineLines: readonly string[],
  start: number,
  end: number,
  hunks: readonly LineHunk[]
): string {
  let value = "";
  let baselineIndex = start;
  for (const hunk of hunks) {
    value += baselineLines.slice(baselineIndex, hunk.start).join("");
    value += hunk.replacement.join("");
    baselineIndex = hunk.end;
  }
  value += baselineLines.slice(baselineIndex, end).join("");
  return value;
}

function allPureInsertions(hunks: readonly LineHunk[]): boolean {
  return hunks.length > 0 && hunks.every((hunk) => hunk.start === hunk.end);
}

function applyInsertionHunksToMarkdown(
  baselineStart: number,
  insertionHunks: readonly LineHunk[],
  markdown: string
): string {
  const lines = splitLines(markdown);
  let value = "";
  let lineIndex = 0;

  for (const hunk of insertionHunks) {
    const targetIndex = Math.max(0, Math.min(lines.length, hunk.start - baselineStart));
    value += lines.slice(lineIndex, targetIndex).join("");
    value += hunk.replacement.join("");
    lineIndex = targetIndex;
  }

  value += lines.slice(lineIndex).join("");
  return value;
}

function hunkComesBefore(left: LineHunk, right: LineHunk): boolean {
  if (left.end < right.start) return true;
  if (left.end > right.start) return false;
  return !(left.start === left.end && right.start === right.end && left.start === right.start);
}

function hunkOverlapsRange(hunk: LineHunk, start: number, end: number): boolean {
  if (hunk.start === hunk.end) {
    if (start === end) return hunk.start === start;
    return hunk.start > start && hunk.start < end;
  }
  return hunk.start < end && hunk.end > start;
}

function splitLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function conflictHunksFromLineDiff(changes: readonly Change[]): string {
  let markdown = "";
  let local = "";
  let remote = "";

  for (const change of changes) {
    if (!change.added && !change.removed) {
      markdown += flushConflictHunk(local, remote);
      local = "";
      remote = "";
      markdown += change.value;
      continue;
    }

    if (change.removed) {
      local += change.value;
    } else if (change.added) {
      remote += change.value;
    }
  }

  markdown += flushConflictHunk(local, remote);
  return markdown;
}

function flushConflictHunk(local: string, remote: string): string {
  if (local === "" && remote === "") return "";
  return conflictHunk(local, remote);
}

function conflictHunk(local: string, remote: string): string {
  return `<<<<<<< Local Draft\n${ensureTrailingNewline(local)}=======\n${ensureTrailingNewline(remote)}>>>>>>> Google Drive\n`;
}

function cleanMergeResult(input: MergeInput, mergedMarkdown: string): MergeResult {
  return mergeResultFromParts(input, mergedMarkdown, [], {
    thisDeviceForUnresolved: mergedMarkdown,
    googleDriveForUnresolved: mergedMarkdown
  });
}

function mergeResultFromParts(
  input: MergeInput,
  manualConflictMarkdown: string,
  unresolvedHunks: readonly UnresolvedMergeHunk[],
  unresolvedChoices: {
    readonly thisDeviceForUnresolved: string;
    readonly googleDriveForUnresolved: string;
  }
): MergeResult {
  const thisDeviceForUnresolved = unresolvedHunks.length > 0 && unresolvedChoices.thisDeviceForUnresolved !== input.local
    ? unresolvedChoices.thisDeviceForUnresolved
    : null;
  const googleDriveForUnresolved = unresolvedHunks.length > 0 && unresolvedChoices.googleDriveForUnresolved !== input.remote
    ? unresolvedChoices.googleDriveForUnresolved
    : null;
  return {
    mergedMarkdown: manualConflictMarkdown,
    unresolvedHunks,
    choices: {
      thisDevice: input.local,
      googleDrive: input.remote,
      thisDeviceForUnresolved,
      googleDriveForUnresolved
    },
    manualConflictMarkdown,
    merged: manualConflictMarkdown,
    conflicted: unresolvedHunks.length > 0
  };
}
