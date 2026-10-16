import { render } from "solid-js/web";
import { DailyNoteSearchDialog } from "./DailyNoteSearchDialog";
import type { DailyNoteSearch, DailyNoteSearchResult } from "~/domain/dailyNoteSearch";

it("ignores old query/range responses and responses after closing", async () => {
  const pending: Array<(dates: DailyNoteSearchResult[]) => void> = [];
  const search = vi.fn((_input: DailyNoteSearch) => new Promise<DailyNoteSearchResult[]>((resolve) => pending.push(resolve)));
  const host = document.createElement("div");
  document.body.append(host);
  const close = vi.fn();
  const dispose = render(() => <DailyNoteSearchDialog selectedDate="2030-02-04" today="2030-02-04" search={search} loadPreview={async () => ""} onSelect={() => {}} onClose={close} />, host);
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  const submit = () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const change = (element: HTMLInputElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    change(input, "alpha"); submit();
    change(input, "beta"); submit();
    pending[1]!([{ date: "2030-02-02", fileId: "2030-02-02", modifiedTime: "2030-01-01T00:00:00.000Z", sizeBytes: "12" }]); await Promise.resolve();
    pending[0]!([{ date: "2030-01-01", fileId: "2030-01-01", modifiedTime: "2030-01-01T00:00:00.000Z", sizeBytes: "12" }]); await Promise.resolve();
    expect(host.textContent).toContain("2030-02-02");
    expect(host.querySelector("ul button")?.textContent).not.toBe("2030-01-01");
    expect(host.querySelector("time")?.dateTime).toBe("2030-01-01T00:00:00.000Z");
    expect(host.querySelector(".search-result-metadata")?.textContent).toContain("12 bytes");
    submit();
    change(host.querySelector<HTMLInputElement>('input[type="date"]')!, "2030-03-01");
    pending[2]!([{ date: "2030-02-02", fileId: "2030-02-02", modifiedTime: "2030-01-01T00:00:00.000Z", sizeBytes: "12" }]); await Promise.resolve();
    expect(host.querySelector('ul')).toBeNull();
    submit();
    const mode = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    mode.checked = true;
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    pending[3]!([{ date: "2030-03-02", fileId: "old-mode", modifiedTime: null, sizeBytes: null }]); await Promise.resolve();
    expect(host.querySelector("ul")).toBeNull();
    submit();
    expect(search.mock.calls.at(-1)?.[0]).toMatchObject({ dateBasis: "modified" });
    host.querySelector<HTMLButtonElement>('button[aria-label="Close search"]')!.click();
    pending[4]!([{ date: "2030-03-02", fileId: "2030-03-02", modifiedTime: "2030-01-01T00:00:00.000Z", sizeBytes: "12" }]); await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    expect(host.querySelector('ul')).toBeNull();
  } finally { dispose(); host.remove(); }
});
