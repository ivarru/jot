import { DEFAULT_JOT_SETTINGS, millisecondsToSeconds, normalizeJotSettings, secondsToMilliseconds } from "./settings";

describe("settings", () => {
  it("uses defaults for missing settings", () => {
    expect(normalizeJotSettings(null)).toEqual(DEFAULT_JOT_SETTINGS);
  });

  it("normalizes invalid values", () => {
    expect(
      normalizeJotSettings({
        autosaveDebounceMs: -1,
        cleanPollingIntervalMs: 4500.8,
        dirtyPollingIntervalMs: "fast",
        retryInitialDelayMs: 1000,
        retryMaxDelayMs: 500
      })
    ).toEqual({
      ...DEFAULT_JOT_SETTINGS,
      cleanPollingIntervalMs: 4501,
      retryInitialDelayMs: 1000,
      retryMaxDelayMs: 1000
    });
  });

  it("converts between milliseconds and user-facing seconds", () => {
    expect(millisecondsToSeconds(15000)).toBe(15);
    expect(secondsToMilliseconds(2.5)).toBe(2500);
  });
});
