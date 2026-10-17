import { render } from "solid-js/web";
import { TagIndexDialog } from "./TagIndexDialog";
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

it("ignores late tag selections and closes without restoring menu focus when opening an occurrence", async () => {
  const pending: Array<(value: string) => void> = [];
  const host = document.createElement("div"); document.body.append(host);
  const close = vi.fn(); const open = vi.fn();
  const dispose = render(() => <TagIndexDialog listTags={async () => ["work", "api"]}
    loadIndex={() => new Promise((resolve) => pending.push(resolve))} onSelect={open} onClose={close} />, host);
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === name)!;
  try {
    await tick();
    button("#api").click(); button("#work").click();
    pending[1]!("2030-02-01 **Work** [link](https://example.com)  \n2030-02-01 Again  \n"); await tick();
    pending[0]!("2030-02-02 Stale API  \n"); await tick();
    expect(host.textContent).not.toContain("Stale API");
    expect(host.querySelector("strong")?.textContent).toBe("Work");
    expect(host.querySelector("[role='link']")?.getAttribute("aria-disabled")).toBe("true");
    expect(host.querySelector("a[href]")).toBeNull();
    host.querySelectorAll<HTMLButtonElement>(".tag-index-occurrence")[1]!.click();
    expect(close).toHaveBeenCalledWith(false);
    expect(open).toHaveBeenCalledWith({ tag: "work", date: "2030-02-01", ordinal: 1, excerpts: ["**Work** [link](https://example.com)", "Again"] });
  } finally { dispose(); host.remove(); }
});

it("ignores tag-list responses after closing", async () => {
  const host = document.createElement("div"); document.body.append(host);
  let release!: (value: readonly string[]) => void;
  const dispose = render(() => <TagIndexDialog listTags={() => new Promise((resolve) => { release = resolve; })}
    loadIndex={async () => { throw new Error("offline"); }} onSelect={() => {}} onClose={() => {}} />, host);
  try {
    host.querySelector<HTMLButtonElement>("[aria-label='Close tags']")!.click();
    release(["late"]); await tick();
    expect(host.textContent).not.toContain("#late");
  } finally { dispose(); host.remove(); }
});

it("retries list and occurrence failures and filters indexed tags", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const list = vi.fn().mockRejectedValueOnce(new Error("List offline")).mockResolvedValue(["work", "api"]);
  const load = vi.fn().mockRejectedValueOnce(new Error("Index offline")).mockResolvedValue("2030-02-01 Work  \n");
  const dispose = render(() => <TagIndexDialog listTags={list} loadIndex={load} onSelect={() => {}} onClose={() => {}} />, host);
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === label)!;
  try {
    await tick(); expect(host.querySelector("[role='alert']")?.textContent).toBe("List offline");
    button("Refresh tags").click(); await tick();
    const filter = host.querySelector<HTMLInputElement>("input[type='search']")!;
    filter.value = "work"; filter.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host.querySelector("nav")!.textContent).toBe("#work");
    button("#work").click(); await tick();
    expect(host.querySelector("[role='alert']")?.textContent).toContain("Index offline");
    button("Retry occurrences").click(); await tick();
    expect(host.querySelector(".tag-index-occurrence")?.textContent).toContain("Work");
  } finally { dispose(); host.remove(); }
});
