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
    click(host, "Tag"); await settle();
    click(host, "Expand #work"); await settle();
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
    click(host, "Tag"); await settle(); click(host, "Expand #work"); await settle();
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
    click(host, "Tag"); await settle(); click(host, "Expand #work"); await settle();
    host.querySelector<HTMLButtonElement>(".tag-index-occurrence")!.click();
    await started.promise;
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(cached));
    finish.resolve();
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(refreshed));
    await wait(() => expect(host.querySelector("[aria-label='Tag navigation']")).toBeNull());
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.selectionStart).toBe(refreshed.indexOf(tag));
  } finally { finish.resolve(); dispose(); host.remove(); }
});

it("requests tag maintenance after a departed A save finishes while B stays untouched", async () => {
  const maintained: string[] = [];
  state.maintainTagIndex = async () => { maintained.push(state.remoteNote?.markdown ?? ""); };
  const started = deferred(); const finish = deferred();
  state.delayedRemoteSave = { date: "2030-02-02", started, finish, consumed: false };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")).not.toBeNull());
    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
    editor.value = `Leaving A ${tag}`; editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    click(host, "Next day");
    await started.promise;
    await wait(() => expect(host.querySelector<HTMLInputElement>("[aria-label='Selected date']")?.value).toBe("2030-02-03"));
    // Let the destination's synced-status maintenance finish before A's upload.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(maintained).not.toContain(`Leaving A ${tag}`);
    finish.resolve();
    await wait(() => expect(state.remoteNote?.markdown).toBe(`Leaving A ${tag}`));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(maintained).toContain(`Leaving A ${tag}`);
    expect(state.remoteSaveInputs).toEqual(["2030-02-02"]);
    expect(host.querySelector<HTMLInputElement>("[aria-label='Selected date']")?.value).toBe("2030-02-03");
  } finally { finish.resolve(); dispose(); host.remove(); }
});

it("does not insert or restore A's caret after the unified dialog outlives navigation to B", async () => {
  state.remoteNote = { date: "2030-02-02", markdown: "A content", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" };
  let releaseIndex!: (value: string) => void;
  state.pendingTagIndex = { promise: new Promise((resolve) => { releaseIndex = resolve; }), resolve: (value) => releaseIndex(value as string) };
  state.tagIndexFiles = { work: "" };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("A content"));
    state.drafts.set("2030-02-03", { date: "2030-02-03", markdown: "B content", baselineMarkdown: "B content", baselineRevisionId: null,
      dirty: true, updatedAt: "2030-01-01T00:00:00Z" });
    const sourceEditor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
    sourceEditor.value = "A pending edit"; sourceEditor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    click(host, "Tag"); await settle();
    const query = host.querySelector<HTMLInputElement>("[role='combobox']")!;
    query.value = "work"; query.dispatchEvent(new InputEvent("input", { bubbles: true }));
    click(host, "Expand #work");
    window.location.hash = "#/date/2030-02-03"; window.dispatchEvent(new HashChangeEvent("hashchange"));
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("B content"));
    releaseIndex("2030-02-02 A content  \n"); await settle();
    expect(host.querySelector<HTMLButtonElement>(".tag-field-add")?.disabled).toBe(true);
    const editor = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!;
    editor.setSelectionRange(2, 2);
    host.querySelector<HTMLButtonElement>(".tag-field-add")!.click();
    click(host, "Close tags"); await settle();
    expect(editor.value).toBe("B content"); expect(editor.selectionStart).toBe(2);
    expect(state.drafts.get("2030-02-02")?.markdown).toBe("A pending edit");
  } finally { releaseIndex(""); dispose(); host.remove(); }
});

it("suggests a newly created local tag on reopening before its index exists", async () => {
  state.remoteNote = { date: "2030-02-02", markdown: "A content", revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("A content"));
    click(host, "Tag"); await settle();
    const input = host.querySelector<HTMLInputElement>("[role='combobox']")!;
    input.value = "new-tag"; input.dispatchEvent(new Event("input", { bubbles: true }));
    click(host, "Create"); await settle();
    click(host, "Tag");
    await wait(() => expect(host.querySelector("[aria-label='Use #new-tag']")).not.toBeNull());
    expect(state.tagIndexFiles["new-tag"]).toBeUndefined();
    click(host, "Use #new-tag"); await settle();
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value.match(/jot:tag\/new-tag/g)).toHaveLength(2);
  } finally { dispose(); host.remove(); }
});

it("keeps the captured A tag snapshot when a local catalog refresh finishes after navigation to B", async () => {
  const source = "A [#local-a](jot:tag/local-a)";
  state.remoteNote = { date: "2030-02-02", markdown: source, revisionId: "a", updatedAt: "2030-01-01T00:00:00Z" };
  const host = document.createElement("div"); document.body.append(host);
  const dispose = render(() => <Home />, host);
  const started = deferred(); const finish = deferred();
  try {
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe(source));
    state.delayedDraftLoad = { date: "2030-02-02", result: state.drafts.get("2030-02-02") ?? null, started, finish, consumed: false };
    state.drafts.set("2030-02-03", { date: "2030-02-03", markdown: "B content", baselineMarkdown: "B content", baselineRevisionId: null,
      dirty: true, updatedAt: "2030-01-01T00:00:00Z" });
    click(host, "Tag"); await started.promise;
    window.location.hash = "#/date/2030-02-03"; window.dispatchEvent(new HashChangeEvent("hashchange"));
    await wait(() => expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")?.value).toBe("B content"));
    finish.resolve();
    await wait(() => expect(host.querySelector("[aria-label='Use #local-a']")).not.toBeNull());
    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.value).toBe("B content");
    expect(state.drafts.get("2030-02-02")?.markdown).toBe(source);
    click(host, "Close tags"); await settle(); click(host, "Tag");
    await wait(() => expect(host.querySelector("[aria-label='Use #local-a']")).not.toBeNull());
  } finally { finish.resolve(); dispose(); host.remove(); }
});
