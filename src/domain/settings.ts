export interface JotSettings {
  readonly autosaveDebounceMs: number;
  readonly cleanPollingIntervalMs: number;
  readonly dirtyPollingIntervalMs: number;
  readonly retryInitialDelayMs: number;
  readonly retryMaxDelayMs: number;
}

export const DEFAULT_JOT_SETTINGS: JotSettings = {
  autosaveDebounceMs: 2000,
  cleanPollingIntervalMs: 120000,
  dirtyPollingIntervalMs: 15000,
  retryInitialDelayMs: 5000,
  retryMaxDelayMs: 300000
};

const MIN_VALUE_MS = 250;
const MS_PER_SECOND = 1000;

export function normalizeJotSettings(input: unknown): JotSettings {
  if (!isRecord(input)) return DEFAULT_JOT_SETTINGS;

  const settings: JotSettings = {
    autosaveDebounceMs: positiveNumber(input.autosaveDebounceMs, DEFAULT_JOT_SETTINGS.autosaveDebounceMs),
    cleanPollingIntervalMs: positiveNumber(input.cleanPollingIntervalMs, DEFAULT_JOT_SETTINGS.cleanPollingIntervalMs),
    dirtyPollingIntervalMs: positiveNumber(input.dirtyPollingIntervalMs, DEFAULT_JOT_SETTINGS.dirtyPollingIntervalMs),
    retryInitialDelayMs: positiveNumber(input.retryInitialDelayMs, DEFAULT_JOT_SETTINGS.retryInitialDelayMs),
    retryMaxDelayMs: positiveNumber(input.retryMaxDelayMs, DEFAULT_JOT_SETTINGS.retryMaxDelayMs)
  };

  if (settings.retryMaxDelayMs < settings.retryInitialDelayMs) {
    return { ...settings, retryMaxDelayMs: settings.retryInitialDelayMs };
  }

  return settings;
}

export function millisecondsToSeconds(milliseconds: number): number {
  return milliseconds / MS_PER_SECOND;
}

export function secondsToMilliseconds(seconds: number): number {
  return Math.round(seconds * MS_PER_SECOND);
}

function positiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_VALUE_MS) {
    return fallback;
  }

  return Math.round(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
