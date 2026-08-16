import type { IsoDate } from "~/domain/dates";
import type { SyncStatus } from "~/storage/types";

export const SYNC_DIAGNOSTIC_RETENTION_MS = 60_000;
const MAX_SYNC_DIAGNOSTIC_EVENTS = 250;

export type SyncDiagnosticSource =
  | "autosave"
  | "background"
  | "blur"
  | "foreground"
  | "manual"
  | "poll"
  | "retry"
  | "reconnect";

export interface SyncDiagnosticEventInput {
  readonly event: string;
  readonly date?: IsoDate;
  readonly source?: SyncDiagnosticSource;
  /** Never retained verbatim: stored only as a length and a non-cryptographic diagnostic hash. */
  readonly markdown?: string;
  /** Never retained verbatim: stored only as a non-cryptographic diagnostic hash. */
  readonly expectedRevisionId?: string | null;
  /** Never retained verbatim: stored only as a non-cryptographic diagnostic hash. */
  readonly revisionId?: string | null;
  readonly status?: SyncStatus;
  readonly generation?: number;
}

export interface SyncDiagnosticEvent {
  readonly at: number;
  readonly event: string;
  readonly date?: IsoDate;
  readonly source?: SyncDiagnosticSource;
  readonly markdown?: MarkdownFingerprint;
  readonly expectedRevisionHash?: string | null;
  readonly revisionHash?: string | null;
  readonly status?: SyncStatus;
  readonly generation?: number;
}

export interface MarkdownFingerprint {
  readonly length: number;
  readonly hash: string;
}

export class SyncDiagnosticsBuffer {
  private enabled = false;
  private paused = false;
  private events: SyncDiagnosticEvent[] = [];
  private readonly salt = createDiagnosticSalt();

  constructor(private readonly now: () => number = Date.now) {}

  setEnabled(enabled: boolean): void {
    if (this.enabled && !enabled) this.events = [];
    this.enabled = enabled;
  }

  setPaused(paused: boolean): void {
    if (paused && !this.paused) this.prune(this.now());
    this.paused = paused;
  }

  record(input: SyncDiagnosticEventInput): void {
    if (!this.enabled || this.paused) return;

    const at = this.now();
    this.prune(at);
    this.events.push({
      at,
      event: input.event,
      ...(input.date === undefined ? {} : { date: input.date }),
      ...(input.source === undefined ? {} : { source: input.source }),
      ...(input.markdown === undefined ? {} : { markdown: fingerprintMarkdown(input.markdown, this.salt) }),
      ...(input.expectedRevisionId === undefined ? {} : { expectedRevisionHash: hashOptional(input.expectedRevisionId, this.salt) }),
      ...(input.revisionId === undefined ? {} : { revisionHash: hashOptional(input.revisionId, this.salt) }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.generation === undefined ? {} : { generation: input.generation })
    });
    if (this.events.length > MAX_SYNC_DIAGNOSTIC_EVENTS) {
      this.events.splice(0, this.events.length - MAX_SYNC_DIAGNOSTIC_EVENTS);
    }
  }

  snapshot(): readonly SyncDiagnosticEvent[] {
    if (!this.paused) this.prune(this.now());
    return this.events.slice();
  }

  hasEvents(): boolean {
    return this.snapshot().length > 0;
  }

  private prune(now: number): void {
    const oldest = now - SYNC_DIAGNOSTIC_RETENTION_MS;
    const firstCurrentEvent = this.events.findIndex((event) => event.at >= oldest);
    if (firstCurrentEvent === -1) {
      this.events = [];
    } else if (firstCurrentEvent > 0) {
      this.events.splice(0, firstCurrentEvent);
    }
  }
}

export function formatSyncDiagnostics(events: readonly SyncDiagnosticEvent[]): string {
  return [
    "Jot sync diagnostics v1",
    "Retention: last 60 seconds in memory. Note contents and raw Drive identifiers are omitted.",
    ...events.map((event) => JSON.stringify(event))
  ].join("\n");
}

function fingerprintMarkdown(markdown: string, salt: string): MarkdownFingerprint {
  return { length: markdown.length, hash: diagnosticHash(`${salt}\u0000${markdown}`) };
}

function hashOptional(value: string | null, salt: string): string | null {
  return value === null ? null : diagnosticHash(`${salt}\u0000${value}`);
}

function createDiagnosticSalt(): string {
  const bytes = new Uint32Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return bytes.join("-");
}

function diagnosticHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
