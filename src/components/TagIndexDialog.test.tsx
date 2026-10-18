import { createSignal, mergeProps } from "solid-js";
import { render } from "solid-js/web";
import { TagIndexDialog, type TagDialogProps } from "./TagIndexDialog";
import { createTagIndexCatalog } from "~/storage/tagIndexCatalog";
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function mount(overrides: Partial<TagDialogProps> = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const props = mergeProps({ tags: ["work", "api"], alphabetical: false, onAlphabeticalChange: () => {},
    refreshing: false, listError: null, onRefresh: async () => {}, loadIndex: async () => "",
    insertionUnavailable: null, addError: null, onAdd: vi.fn(), onSelect: vi.fn(), onClose: vi.fn() }, overrides);
  const dispose = render(() => <TagIndexDialog {...props} />, host);
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.getAttribute("aria-label") === name || element.textContent === name)!;
  const input = host.querySelector<HTMLInputElement>("[role='combobox']")!;
  const fill = (value: string) => { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); };
  const key = (value: string) => { const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }); input.dispatchEvent(event); return event; };
  return { host, props, button, input, fill, key, dispose: () => { dispose(); host.remove(); } };
}
it("expands tags independently, ignores collapsed late responses, and preserves occurrence targets", async () => {
  const pending: Array<(value: string) => void> = [];
  const view = mount({ loadIndex: () => new Promise((resolve) => pending.push(resolve)) });
  try {
    view.button("Expand #api").click(); view.button("Expand #work").click(); view.button("Collapse #api").click();
    pending[1]!("2030-02-01 **Work** [link](https://example.com)  \n2030-02-01 Again  \n2030-02-02 Newest  \n"); await tick();
    pending[0]!("2030-02-02 Stale API  \n"); await tick();
    expect(view.host.textContent).not.toContain("Stale API");
    expect(view.host.querySelector("strong")?.textContent).toBe("Work");
    expect(view.host.querySelector("[role='link']")?.getAttribute("aria-disabled")).toBe("true");
    expect(view.host.querySelector("a[href]")).toBeNull();
    const rows = view.host.querySelectorAll<HTMLButtonElement>(".tag-index-occurrence");
    expect([...rows].map((row) => row.querySelector("time")?.textContent)).toEqual(["2030-02-02", "2030-02-01", "2030-02-01"]);
    expect(rows[2]!.querySelector("time")?.classList.contains("tag-date-repeated")).toBe(true);
    expect(view.host.textContent).not.toContain("Instance");
    rows[2]!.click();
    expect(view.props.onClose).toHaveBeenCalledWith(false);
    expect(view.props.onSelect).toHaveBeenCalledWith({ tag: "work", date: "2030-02-01", ordinal: 1, excerpts: ["**Work** [link](https://example.com)", "Again"] });
  } finally { view.dispose(); }
});
it("keeps cached rows during refresh and distinguishes expanding a row from adding its tag", async () => {
  const load = vi.fn().mockResolvedValue("");
  const view = mount({ refreshing: true, listError: "offline", loadIndex: load });
  try {
    expect(view.host.querySelector("ul")?.textContent).toContain("#work");
    expect(view.host.querySelector("[role='alert']")?.textContent).toContain("offline");
    expect(view.button("Create").hidden).toBe(true);
    view.fill("   "); expect(view.button("Create").hidden).toBe(true);
    view.fill("New Tag"); expect(view.button("Create").hidden).toBe(false); view.button("Create").click();
    expect(view.props.onAdd).toHaveBeenCalledWith("new-tag");
    view.fill("  WORK  "); expect(view.button("Use").disabled).toBe(false);
    view.fill("wor"); expect(view.button("Create").disabled).toBe(false);
    view.fill(""); view.button("Use #work").click();
    expect(view.props.onAdd).toHaveBeenLastCalledWith("work");
    expect(load).not.toHaveBeenCalled();
    expect(view.button("Expand #work").getAttribute("aria-expanded")).toBe("false");
    expect(view.host.querySelector(".tag-index-row")?.getAttribute("title")).toBe("Click to show tag occurrences");
    expect(view.host.querySelector(".tag-index-modified")?.textContent).toMatch(/^Changed/);
    expect(view.host.querySelector(".tag-index-modified")?.getAttribute("title")).toContain("added or removed");
    view.host.querySelector<HTMLDivElement>(".tag-index-row")!.click(); await tick();
    expect(load).toHaveBeenCalledTimes(1);
    expect(view.button("Collapse #work").getAttribute("aria-expanded")).toBe("true");
  } finally { view.dispose(); }
});
it("completes prefixes and moves secondary focus without changing the query", async () => {
  const [tags, setTags] = createSignal(["research", "release-notes", "work"]);
  const view = mount({ get tags() { return tags(); } });
  try {
    view.fill("re"); expect(view.key("Tab").defaultPrevented).toBe(false);
    view.fill("res"); expect(view.key("Tab").defaultPrevented).toBe(true); expect(view.input.value).toBe("research");
    view.fill("re"); view.key("ArrowDown");
    expect(view.input.value).toBe("re");
    expect(view.button("Use #research").classList.contains("is-secondary-focus")).toBe(true);
    setTags(["release-notes", "research", "work"]); await tick();
    expect(view.button("Use #research").classList.contains("is-secondary-focus")).toBe(true);
    view.key("Enter"); expect(view.props.onAdd).toHaveBeenCalledWith("research");
    view.key("ArrowUp"); view.key("ArrowUp"); view.key("Enter");
    expect(view.props.onAdd).toHaveBeenLastCalledWith("re");
    view.fill("unmatched"); view.key("ArrowDown"); view.key("Enter");
    expect(view.props.onAdd).toHaveBeenLastCalledWith("unmatched");
  } finally { view.dispose(); }
});
it("disables all insertions but still permits browsing when the editor context is unavailable", async () => {
  const view = mount({ insertionUnavailable: "The note changed.", loadIndex: async () => "2030-02-01 Work  \n" });
  try {
    view.fill("work"); view.key("Enter"); view.key("ArrowDown");
    expect(view.button("Use").disabled).toBe(true); expect(view.button("Use #work").disabled).toBe(true);
    expect(view.props.onAdd).not.toHaveBeenCalled();
    view.fill(""); view.button("Expand #work").click(); await tick();
    expect(view.host.querySelector(".tag-index-occurrence")?.textContent).toContain("Work");
    const escape = view.key("Escape"); expect(escape.defaultPrevented).toBe(true);
    expect(view.props.onClose).toHaveBeenCalledWith(true);
  } finally { view.dispose(); }
});
it("retries metadata and per-tag failures while retaining cached rows", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("List offline")).mockResolvedValue([{ tag: "work", modifiedTime: null }]);
  const load = vi.fn().mockRejectedValueOnce(new Error("Index offline")).mockResolvedValue("2030-02-01 Work  \n");
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => {
    const catalog = createTagIndexCatalog({ list });
    return <TagIndexDialog tags={catalog.tags()} alphabetical={catalog.alphabetical()} onAlphabeticalChange={catalog.setAlphabetical}
      refreshing={catalog.refreshing()} listError={catalog.error()} onRefresh={catalog.refresh}
      insertionUnavailable={null} addError={null} onAdd={() => {}} loadIndex={load} onSelect={() => {}} onClose={() => {}} />;
  }, host);
  const click = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text || b.getAttribute("aria-label") === text)!.click();
  try {
    await tick(); expect(host.textContent).toContain("List offline");
    click("Retry tags"); await tick(); click("Expand #work"); await tick();
    expect(host.textContent).toContain("Index offline");
    click("Retry occurrences"); await tick(); expect(host.querySelector(".tag-index-occurrence")?.textContent).toContain("Work");
  } finally { dispose(); host.remove(); }
});

it("shows refresh progress in the title without a Cancel action or extra status row", async () => {
  const [refreshing, setRefreshing] = createSignal(true);
  const view = mount({ get refreshing() { return refreshing(); } });
  try {
    expect(view.host.querySelector("h2")?.textContent).toBe("Tags (refreshing…)");
    expect(view.host.querySelector("[role='status']")?.closest("h2")).not.toBeNull();
    expect([...view.host.querySelectorAll("button")].some(button => button.textContent === "Cancel")).toBe(false);
    setRefreshing(false); await tick();
    expect(view.host.querySelector("h2")?.textContent).toBe("Tags");
    expect(view.host.querySelector("[role='status']")).toBeNull();
  } finally { view.dispose(); }
});

it("reloads an expanded local-only tag when its index appears even with the same timestamp", async () => {
  const [indexed, setIndexed] = createSignal(false);
  const load = vi.fn().mockResolvedValueOnce("").mockResolvedValueOnce("2030-02-01 Newly synced  \n");
  const options = { tags: ["work"], hasIndex: () => indexed(), modifiedTime: () => "2030-02-01T00:00:00Z", loadIndex: load };
  const view = mount(options);
  try {
    view.button("Expand #work").click(); await tick();
    expect(view.host.textContent).toContain("No synced occurrences yet.");
    setIndexed(true); await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(view.host.textContent).toContain("Newly synced");
  } finally { view.dispose(); }
});

it("invalidates collapsed rows and ignores an older pending load after index metadata changes", async () => {
  const [time, setTime] = createSignal("2030-02-01T00:00:00Z");
  const pending: Array<(value: string) => void> = [];
  const load = vi.fn(() => new Promise<string>(resolve => pending.push(resolve)));
  const view = mount({ tags: ["work"], modifiedTime: () => time(), loadIndex: load });
  try {
    view.button("Expand #work").click();
    setTime("2030-02-02T00:00:00Z"); await tick();
    expect(load).toHaveBeenCalledTimes(2);
    pending[1]!("2030-02-01 Updated  \n"); await tick();
    pending[0]!("2030-02-01 Obsolete  \n"); await tick();
    expect(view.host.textContent).toContain("Updated");
    expect(view.host.textContent).not.toContain("Obsolete");
    view.button("Collapse #work").click();
    setTime("2030-02-03T00:00:00Z"); await tick();
    expect(load).toHaveBeenCalledTimes(2);
    view.button("Expand #work").click();
    expect(load).toHaveBeenCalledTimes(3);
    pending[2]!("2030-02-01 Latest  \n"); await tick();
    expect(view.host.textContent).toContain("Latest");
    expect(view.host.textContent).not.toContain("Updated");
  } finally { view.dispose(); }
});
