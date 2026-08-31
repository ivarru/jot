import { createRoot, createSignal } from "solid-js";
import { createDailyNoteDatePicker } from "./createDailyNoteDatePicker";

describe("createDailyNoteDatePicker", () => {
  it("tracks selected months while closed and preserves browsing while open", () => {
    createRoot((dispose) => {
      const [selectedDate, setSelectedDate] = createSignal<"2030-02-02" | "2030-03-03">("2030-02-02");
      const picker = createDailyNoteDatePicker({ selectedDate, today: () => "2030-01-01" });

      expect(picker.month()).toBe("2030-02");
      setSelectedDate("2030-03-03");
      expect(picker.month()).toBe("2030-03");

      picker.show();
      picker.setMonth("2030-04");
      setSelectedDate("2030-02-02");
      expect(picker.month()).toBe("2030-04");

      picker.reset();
      expect(picker.open()).toBe(false);
      expect(picker.month()).toBe("2030-02");
      dispose();
    });
  });

  it("closes after focus leaves its root", async () => {
    let open = true;
    let disposeRoot: () => void = () => undefined;
    const root = document.createElement("div");
    const outside = document.createElement("button");
    document.body.append(root, outside);
    createRoot((dispose) => {
      disposeRoot = dispose;
      const picker = createDailyNoteDatePicker({ selectedDate: () => "2030-02-02", today: () => "2030-01-01" });
      picker.setRootElement(root);
      picker.show();

      outside.focus();
      picker.handleFocusOut({ currentTarget: root } as FocusEvent & { currentTarget: HTMLDivElement });
      window.setTimeout(() => {
        open = picker.open();
      }, 0);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(open).toBe(false);
    disposeRoot();
    document.body.replaceChildren();
  });
});
