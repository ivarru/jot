import { diffLines, type Change } from "diff";

export interface MergeInput {
  readonly baseline: string;
  readonly local: string;
  readonly remote: string;
}

export interface MergeResult {
  readonly merged: string;
  readonly conflicted: boolean;
}

export function mergeDailyNote(input: MergeInput): MergeResult {
  if (input.local === input.remote) {
    return { merged: input.local, conflicted: false };
  }

  if (input.local === input.baseline) {
    return { merged: input.remote, conflicted: false };
  }

  if (input.remote === input.baseline) {
    return { merged: input.local, conflicted: false };
  }

  const merged = tryAppendOnlyMerge(input);
  if (merged !== null) {
    return { merged, conflicted: false };
  }

  return {
    merged: createConflictMarkdown(input.local, input.remote),
    conflicted: true
  };
}

export function createConflictMarkdown(local: string, remote: string): string {
  return conflictHunksFromLineDiff(diffLines(local, remote));
}

function tryAppendOnlyMerge(input: MergeInput): string | null {
  if (!input.local.startsWith(input.baseline) || !input.remote.startsWith(input.baseline)) {
    return null;
  }

  const localTail = input.local.slice(input.baseline.length);
  const remoteTail = input.remote.slice(input.baseline.length);
  return `${input.baseline}${localTail}${remoteTail}`;
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
  return `<<<<<<< Local Draft\n${ensureTrailingNewline(local)}=======\n${ensureTrailingNewline(remote)}>>>>>>> Google Drive\n`;
}
