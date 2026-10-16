import { createEffect, onCleanup, Show } from "solid-js";
import {
  addMonths,
  calendarMonth,
  CALENDAR_WEEKDAY_LABELS,
  monthLabel
} from "~/domain/calendarMonth";
import { parseIsoDate, type IsoDate } from "~/domain/dates";
import { isEscapeKey } from "~/components/keyboard";
import type { DailyNoteDatePicker as DailyNoteDatePickerController } from "./createDailyNoteDatePicker";
import type { ExistingNoteDates } from "./createExistingNoteDates";

export interface DailyNoteDatePickerProps {
  readonly controller: DailyNoteDatePickerController;
  readonly selectedDate: IsoDate;
  readonly existingNoteDates: ExistingNoteDates;
  readonly onNavigate: (date: IsoDate) => void;
  readonly onSearch: (returnFocus: HTMLInputElement) => void;
}

export function DailyNoteDatePicker(props: DailyNoteDatePickerProps) {
  let dateInput!: HTMLInputElement;
  const calendar = () => calendarMonth(props.controller.month());

  createEffect(() => {
    const onEscapeKey = (event: KeyboardEvent) => {
      if (!props.controller.open() || !isEscapeKey(event)) return;
      event.preventDefault();
      props.existingNoteDates.cancel();
      props.controller.close({ blurFocus: true });
    };
    window.addEventListener("keydown", onEscapeKey, true);
    window.addEventListener("keyup", onEscapeKey, true);
    document.addEventListener("keydown", onEscapeKey, true);
    document.addEventListener("keyup", onEscapeKey, true);
    onCleanup(() => {
      window.removeEventListener("keydown", onEscapeKey, true);
      window.removeEventListener("keyup", onEscapeKey, true);
      document.removeEventListener("keydown", onEscapeKey, true);
      document.removeEventListener("keyup", onEscapeKey, true);
    });
  });

  const close = () => {
    props.existingNoteDates.cancel();
    props.controller.close();
  };

  return (
    <div
      class="date-picker"
      ref={props.controller.setRootElement}
      onFocusIn={props.controller.show}
      onFocusOut={(event) => {
        const root = event.currentTarget;
        window.setTimeout(() => {
          if (root.contains(document.activeElement)) return;
          props.existingNoteDates.cancel();
          props.controller.close();
        }, 0);
      }}
    >
      <input
        ref={dateInput}
        class="iso-date-input"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
        value={props.selectedDate}
        onFocus={props.controller.show}
        onClick={props.controller.show}
        onChange={(event) => {
          const date = parseIsoDate(event.currentTarget.value);
          if (date !== null) props.onNavigate(date);
          else event.currentTarget.value = props.selectedDate;
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const date = parseIsoDate(event.currentTarget.value);
          if (date !== null) props.onNavigate(date);
        }}
        aria-label="Selected date"
        aria-haspopup="dialog"
        aria-expanded={props.controller.open()}
        aria-controls={props.controller.open() ? "date-picker-popover" : undefined}
      />
      <Show when={props.controller.open()}>
        <div
          id="date-picker-popover"
          class="date-picker-popover"
          role="dialog"
          aria-label="Date picker"
          onKeyDown={(event) => {
            if (isEscapeKey(event)) close();
          }}
        >
          <div class="date-picker-header date-picker-header-search">
            <button
              type="button"
              aria-label="Previous month"
              data-tooltip="Previous month"
              onClick={() => props.controller.setMonth((month) => addMonths(month, -1))}
            >
              ‹
            </button>
            <span class="date-picker-month-label">{monthLabel(props.controller.month())}</span>
            <div class="date-picker-header-actions">
              <button type="button" aria-label="Search daily notes" data-tooltip="Search daily notes" onClick={() => {
                close();
                props.onSearch(dateInput);
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Next month"
                data-tooltip="Next month"
                onClick={() => props.controller.setMonth((month) => addMonths(month, 1))}
              >
                ›
              </button>
            </div>
          </div>
          <div class="date-picker-weekdays" aria-hidden="true">
            {CALENDAR_WEEKDAY_LABELS.map((label) => <span>{label}</span>)}
          </div>
          <div class="date-picker-grid">
            {calendar().weeks.flatMap((week) =>
              week.map((day) => day === null
                ? <span class="date-picker-empty" aria-hidden="true" />
                : (
                  <button
                    type="button"
                    class="date-picker-day"
                    classList={{
                      "has-note": props.existingNoteDates.dates().has(day.date),
                      "is-selected": day.date === props.selectedDate
                    }}
                    aria-label={`${day.date}${props.existingNoteDates.dates().has(day.date) ? ", has note" : ""}`}
                    aria-current={day.date === props.selectedDate ? "date" : undefined}
                    onClick={() => props.onNavigate(day.date)}
                  >
                    <span>{day.dayOfMonth}</span>
                    <span class="date-note-dot" aria-hidden="true" />
                  </button>
                ))
            )}
          </div>
          <Show when={props.existingNoteDates.loading()}>
            <p class="date-picker-status">Loading note dates...</p>
          </Show>
          <Show when={props.existingNoteDates.error()}>
            {(message) => <p class="date-picker-error">{message()}</p>}
          </Show>
        </div>
      </Show>
    </div>
  );
}
