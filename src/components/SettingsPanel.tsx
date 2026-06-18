import { millisecondsToSeconds, secondsToMilliseconds, type JotSettings } from "~/domain/settings";

interface SettingsPanelProps {
  readonly settings: JotSettings;
  readonly onChange: (settings: JotSettings) => void;
}

type TimerSettingKey = Exclude<keyof JotSettings, "spellcheck">;

export function SettingsPanel(props: SettingsPanelProps) {
  const updateSeconds = (key: TimerSettingKey, value: string) => {
    props.onChange({
      ...props.settings,
      [key]: secondsToMilliseconds(Number(value))
    });
  };

  return (
    <section class="settings-panel" aria-label="Sync settings">
      <label>
        <span>Autosave debounce (seconds)</span>
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={millisecondsToSeconds(props.settings.autosaveDebounceMs)}
          onInput={(event) => updateSeconds("autosaveDebounceMs", event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Clean polling (seconds)</span>
        <input
          type="number"
          min="0.25"
          step="1"
          value={millisecondsToSeconds(props.settings.cleanPollingIntervalMs)}
          onInput={(event) => updateSeconds("cleanPollingIntervalMs", event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Dirty polling (seconds)</span>
        <input
          type="number"
          min="0.25"
          step="1"
          value={millisecondsToSeconds(props.settings.dirtyPollingIntervalMs)}
          onInput={(event) => updateSeconds("dirtyPollingIntervalMs", event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Retry initial (seconds)</span>
        <input
          type="number"
          min="0.25"
          step="1"
          value={millisecondsToSeconds(props.settings.retryInitialDelayMs)}
          onInput={(event) => updateSeconds("retryInitialDelayMs", event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Retry max (seconds)</span>
        <input
          type="number"
          min="0.25"
          step="1"
          value={millisecondsToSeconds(props.settings.retryMaxDelayMs)}
          onInput={(event) => updateSeconds("retryMaxDelayMs", event.currentTarget.value)}
        />
      </label>
    </section>
  );
}
