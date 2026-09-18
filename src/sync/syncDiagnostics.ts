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
  | "renewal"
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
  readonly sequence: number;
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

export interface SyncDiagnosticCaptureContext {
  readonly editorMode: "text" | "wysiwyg";
  readonly normalizeEmptyEditorPlaceholders: boolean;
  readonly selectedDate: IsoDate | null;
  readonly loadedDate: IsoDate | null;
  readonly editorChangeEpoch: number;
  readonly browser: {
    readonly userAgent: string;
    readonly language: string;
    readonly online: boolean;
    readonly visibility: string;
    readonly viewportWidth: number;
    readonly viewportHeight: number;
  };
}

interface SyncDiagnosticReportContext extends SyncDiagnosticCaptureContext {
  readonly capturedAt: number;
  readonly sessionId: string;
}

export class SyncDiagnosticsBuffer {
  private enabled = false;
  private paused = false;
  private pausedCapture: string | null = null;
  private events: SyncDiagnosticEvent[] = [];
  private readonly salt = createDiagnosticSalt();
  private readonly sessionId: string;
  private nextSequence = 1;

  constructor(
    private readonly now: () => number = Date.now,
    createSessionId: () => string = createDiagnosticSessionId
  ) {
    this.sessionId = createSessionId();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled && !enabled) {
      this.events = [];
      this.pausedCapture = null;
    }
    this.enabled = enabled;
  }

  setPaused(paused: boolean): void {
    if (paused && !this.paused) this.prune(this.now());
    if (!paused) this.pausedCapture = null;
    this.paused = paused;
  }

  record(input: SyncDiagnosticEventInput): void {
    if (!this.enabled || this.paused) return;

    const at = this.now();
    this.prune(at);
    this.events.push({
      sequence: this.nextSequence++,
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

  capture(appVersion: string, context: SyncDiagnosticCaptureContext): string | null {
    if (!this.enabled) return null;
    if (this.pausedCapture !== null) return this.pausedCapture;
    const events = this.snapshot();
    const reportContext: SyncDiagnosticReportContext = {
      ...context,
      browser: {
        ...context.browser,
        userAgent: sanitizeDiagnosticText(context.browser.userAgent),
        language: sanitizeDiagnosticText(context.browser.language)
      },
      capturedAt: this.paused && events.length > 0 ? events[events.length - 1]!.at : this.now(),
      sessionId: this.sessionId
    };
    const report = formatSyncDiagnostics(events, appVersion, reportContext);
    if (this.paused) this.pausedCapture = report;
    return report;
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

export function formatSyncDiagnostics(
  events: readonly SyncDiagnosticEvent[],
  appVersion: string,
  context?: SyncDiagnosticReportContext
): string {
  return [
    `Jot ${appVersion} sync diagnostics`,
    "Retention: last 60 seconds in memory. Note contents and raw Drive identifiers are omitted.",
    ...(context === undefined ? [] : [JSON.stringify({ type: "capture-context", ...context })]),
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

function createDiagnosticSessionId(): string {
  const bytes = new Uint32Array(2);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function sanitizeDiagnosticText(value: string): string {
  return value.replace(/https?:\/\/\S+/giu, "[url omitted]").slice(0, 256);
}

function diagnosticHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
