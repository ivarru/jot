import { millisecondsToSeconds, secondsToMilliseconds, type JotSettings } from "~/domain/settings";

interface SettingsPanelProps {
  readonly settings: JotSettings;
  readonly onChange: (settings: JotSettings) => void;
  readonly onClose: () => void;
}

type TimerSettingKey = Exclude<keyof JotSettings, "spellcheck" | "syncDiagnosticsEnabled" | "normalizeEmptyEditorPlaceholders">;

export function SettingsPanel(props: SettingsPanelProps) {
  const updateSeconds = (key: TimerSettingKey, value: string) => {
    props.onChange({
      ...props.settings,
      [key]: secondsToMilliseconds(Number(value))
    });
  };

  return (
    <section class="settings-panel" aria-label="Settings">
      <header class="settings-panel-header">
        <h2>Settings</h2>
        <button type="button" class="icon-button" aria-label="Close settings" data-tooltip="Close settings" onClick={props.onClose}>
          ×
        </button>
      </header>
      <div class="settings-timer-grid">
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
      </div>
      <div class="settings-toggle-list">
        <label class="settings-toggle-row">
          <input
            type="checkbox"
            aria-label="Normalize empty editor placeholders when saving"
            checked={props.settings.normalizeEmptyEditorPlaceholders}
            onChange={(event) => props.onChange({
              ...props.settings,
              normalizeEmptyEditorPlaceholders: event.currentTarget.checked
            })}
          />
          <span>
            <strong>Normalize empty editor placeholders when saving</strong>
            <small>Convert standalone {"<br />"} lines to blank lines and remove empty list items.</small>
          </span>
        </label>
        <label class="settings-toggle-row">
          <input
            type="checkbox"
            aria-label="Collect sync diagnostics for conflict reports"
            checked={props.settings.syncDiagnosticsEnabled}
            onChange={(event) => props.onChange({
              ...props.settings,
              syncDiagnosticsEnabled: event.currentTarget.checked
            })}
          />
          <span>
            <strong>Collect sync diagnostics for conflict reports</strong>
            <small>Kept in memory for one minute only. Note contents and raw Google Drive identifiers are not recorded.</small>
          </span>
        </label>
      </div>
    </section>
  );
}
