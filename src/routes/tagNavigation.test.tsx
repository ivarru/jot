import { render } from "solid-js/web";
import { cleanupRouteTestDom, getRouteTestState, resetRouteTestState, type Deferred } from "./routeTestHarness.test-helper";
import Home from "./index";
const state = getRouteTestState();
const tag = "[#work](jot:tag/work)";
beforeEach(() => resetRouteTestState());
afterEach(() => cleanupRouteTestDom());
const settle = async () => { await Promise.resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); };
async function wait(assertion: () => void) {
  for (let i = 0; i < 30; i++) { try { assertion(); return; } catch (error) { if (i === 29) throw error; await settle(); } }
}
function click(host: HTMLElement, label: string) {
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label)!.click();
}
function deferred(): Deferred<void> {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
it("selects the second identical occurrence in the open note without replacing its current content", async () => {
  const markdown = `Same ${tag}\n\nSame ${tag}`;
  state.remoteNote = { date: "2030-02-02", markdown, revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" };
  state.tagIndexFiles = { work: "2030-02-02 Same  \n2030-02-02 Same  \n" };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(markdown));
    click(host, "Open menu"); click(host, "Browse tags"); await settle();
    click(host, "#work"); await settle();
    host.querySelectorAll<HTMLButtonElement>(".tag-index-occurrence")[1]!.click();
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.selectionStart).toBe(markdown.lastIndexOf(tag)));
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe(markdown);
  } finally { dispose(); host.remove(); }
});

it.each([false, true])("cancels a pending B occurrence when navigating to C before B finishes loading (cached: %s)", async (cached) => {
  state.remoteNote = { date: "2030-02-02", markdown: "A content", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" };
  state.tagIndexFiles = { work: "2030-02-03 B target  \n" };
  if (cached) state.drafts.set("2030-02-03", { date: "2030-02-03", markdown: "Cached B", baselineMarkdown: "Cached B",
    baselineRevisionId: "b-old", dirty: false, updatedAt: "2030-01-01T00:00:00Z" });
  const started = deferred(); const finish = deferred();
  state.delayedRemoteLoad = { date: "2030-02-03", result: { date: "2030-02-03", markdown: `B target ${tag}`, revisionId: "b", updatedAt: "2030-01-01T00:00:00Z" }, started, finish, consumed: false };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("A content"));
    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
    editor.value = "A pending edit"; editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    click(host, "Open menu"); click(host, "Browse tags"); await settle(); click(host, "#work"); await settle();
    host.querySelector<HTMLButtonElement>(".tag-index-occurrence")!.click();
    await started.promise;
    click(host, "Next day");
    await wait(() => expect(host.querySelector<HTMLInputElement>("[aria-label='Selected date']")?.value).toBe("2030-02-04"));
    finish.resolve(); await settle(); await settle();
    expect(state.drafts.get("2030-02-02")?.markdown).toBe("A pending edit");
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).not.toContain("B target");
    expect(host.querySelector("[aria-label='Tag navigation']")).toBeNull();
  } finally { finish.resolve(); dispose(); host.remove(); }
});

it.each([
  ["added tag", "Old cached note", `New target ${tag}`],
  ["moved tag", `New target ${tag}`, `An unrelated paragraph\n\nNew target ${tag}`]
])("waits for a clean cached B note's Drive refresh before resolving its indexed occurrence (%s)", async (_, cached, refreshed) => {
  state.remoteNote = { date: "2030-02-02", markdown: "A content", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" };
  state.drafts.set("2030-02-03", { date: "2030-02-03", markdown: cached, baselineMarkdown: cached,
    baselineRevisionId: "b-old", dirty: false, updatedAt: "2030-01-01T00:00:00Z" });
  state.tagIndexFiles = { work: "2030-02-03 New target  \n" };
  const started = deferred(); const finish = deferred();
  state.delayedRemoteLoad = { date: "2030-02-03", result: { date: "2030-02-03", markdown: refreshed,
    revisionId: "b-new", updatedAt: "2030-01-02T00:00:00Z" }, started, finish, consumed: false };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("A content"));
    click(host, "Open menu"); click(host, "Browse tags"); await settle(); click(host, "#work"); await settle();
    host.querySelector<HTMLButtonElement>(".tag-index-occurrence")!.click();
    await started.promise;
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(cached));
    finish.resolve();
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(refreshed));
    await wait(() => expect(host.querySelector("[aria-label='Tag navigation']")).toBeNull());
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.selectionStart).toBe(refreshed.indexOf(tag));
  } finally { finish.resolve(); dispose(); host.remove(); }
});
