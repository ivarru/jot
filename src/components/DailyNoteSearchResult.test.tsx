import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { DailyNoteSearchResult } from "./DailyNoteSearchResult";
import type { DailyNoteSearchResult as SearchResult } from "~/domain/dailyNoteSearch";

vi.mock("./DailyNoteSearchPreview", () => ({ DailyNoteSearchPreview: (props: { markdown: string }) => <p>{props.markdown}</p> }));

it("loads only on expansion and ignores a pending A preview after results switch to B", async () => {
  const a: SearchResult = { date: "2030-02-01", fileId: "a", modifiedTime: null, sizeBytes: "2" };
  const b: SearchResult = { date: "2030-02-02", fileId: "b", modifiedTime: null, sizeBytes: "2" };
  const [result, setResult] = createSignal(a);
  const pending: Array<(value: string) => void> = [];
  const load = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve)));
  const host = document.createElement("div");
  document.body.append(host);
  const open = vi.fn();
  const dispose = render(() => <Show when={result()} keyed>{(value) =>
    <DailyNoteSearchResult selectedDate="2030-02-04" today="2030-02-04" result={value} query="match" loadPreview={load} onOpen={open} />
  }</Show>, host);
  try {
    expect(load).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>(".search-result-row")!.click();
    expect(load).toHaveBeenCalledWith(a);
    expect(open).not.toHaveBeenCalled();
    setResult(b);
    pending[0]!("A late content"); await Promise.resolve();
    expect(host.textContent).not.toContain("A late content");
    host.querySelector<HTMLButtonElement>(".search-result-row")!.click();
    pending[1]!("B current content"); await Promise.resolve();
    expect(host.textContent).toContain("B current content");
    host.querySelector<HTMLButtonElement>(".search-result-row")!.click();
    host.querySelector<HTMLButtonElement>(".search-result-row")!.click();
    expect(load).toHaveBeenCalledTimes(2);
    host.querySelector<HTMLButtonElement>(".search-result-open")!.click();
    expect(open).toHaveBeenCalledOnce();
  } finally { dispose(); host.remove(); }
});

 it("shows an available current-note snapshot synchronously without loading Drive", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const load = vi.fn(async () => "remote");
  const dispose = render(() => <DailyNoteSearchResult result={{ date: "2030-02-01", fileId: "a", modifiedTime: null, sizeBytes: null }} selectedDate="2030-02-01" today="2030-02-02" query="match" getImmediatePreview={() => "local match"} loadPreview={load} onOpen={() => {}} />, host);
  try {
    host.querySelector<HTMLButtonElement>(".search-result-row")!.click();
    expect(host.textContent).toContain("local match");
    expect(host.textContent).not.toContain("Loading note");
    expect(load).not.toHaveBeenCalled();
  } finally { dispose(); host.remove(); }
});
