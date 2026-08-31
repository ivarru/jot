import { createComputed, createSignal, on, type Accessor } from "solid-js";
import { monthOfIsoDate, type YearMonth } from "~/domain/calendarMonth";
import type { IsoDate } from "~/domain/dates";

export interface DailyNoteDatePicker {
  readonly open: Accessor<boolean>;
  readonly month: Accessor<YearMonth>;
  readonly setMonth: (month: YearMonth | ((current: YearMonth) => YearMonth)) => void;
  readonly setRootElement: (element: HTMLDivElement) => void;
  readonly show: () => void;
  readonly close: (options?: { readonly blurFocus?: boolean }) => void;
  readonly handleFocusOut: (event: FocusEvent & { readonly currentTarget: HTMLDivElement }) => void;
  readonly reset: () => void;
}

export function createDailyNoteDatePicker(input: {
  readonly selectedDate: Accessor<IsoDate | null>;
  readonly today: Accessor<IsoDate>;
}): DailyNoteDatePicker {
  const [open, setOpen] = createSignal(false);
  const [month, setMonth] = createSignal<YearMonth>(monthOfIsoDate(input.selectedDate() ?? input.today()));
  let rootElement: HTMLDivElement | undefined;

  createComputed(on(input.selectedDate, (date) => {
    if (date !== null && !open()) setMonth(monthOfIsoDate(date));
  }));

  const close = (options: { readonly blurFocus?: boolean } = {}) => {
    setOpen(false);
    if (options.blurFocus && rootElement?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  };

  return {
    open,
    month,
    setMonth,
    setRootElement: (element) => {
      rootElement = element;
    },
    show: () => setOpen(true),
    close,
    handleFocusOut: (event) => {
      const root = event.currentTarget;
      window.setTimeout(() => {
        if (!root.contains(document.activeElement)) close();
      }, 0);
    },
    reset: () => {
      close();
      setMonth(monthOfIsoDate(input.selectedDate() ?? input.today()));
    }
  };
}
