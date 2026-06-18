import { render } from "solid-js/web";
import { cleanupRouteTestDom, getRouteTestState, resetRouteTestState } from "./routeTestHarness";
import Home from "./index";

const testState = getRouteTestState();

describe("application menu", () => {
  beforeEach(() => {
    resetRouteTestState();
    testState.remoteNote = {
      date: "2030-02-02",
      markdown: "",
      revisionId: "remote-revision",
      updatedAt: "2030-01-01T00:00:00.000Z"
    };
  });

  afterEach(() => {
    cleanupRouteTestDom();
  });

  it("places About first", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    openMenu(host);

    expect(Array.from(host.querySelectorAll(".top-menu-popover [role='menuitem']")).map((element) => element.textContent)).toEqual([
      "About Jot",
      "Upload daily notes",
      "Settings",
      "Turn spellcheck off",
      "Sign out"
    ]);

    dispose();
  });

  it("closes when clicking outside it", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    openMenu(host);
    expect(host.querySelector(".top-menu-popover")).not.toBeNull();

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await settle();

    expect(host.querySelector(".top-menu-popover")).toBeNull();

    dispose();
  });

  it("opens the About dialog with project metadata", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    openMenu(host);
    host.querySelectorAll<HTMLButtonElement>(".top-menu-popover [role='menuitem']")[0]!.click();
    await settle();

    const dialog = host.querySelector<HTMLElement>(".about-modal")!;
    expect(dialog.textContent).toContain("Version");
    expect(dialog.textContent).toContain("test");
    expect(dialog.textContent).toContain("Milkdown 7.21.1");
    expect(dialog.textContent).toContain("MIT");
    expect(dialog.textContent).toContain("Copyright (c) 2026 Test Author");

    const projectLink = dialog.querySelector<HTMLAnchorElement>("a")!;
    expect(projectLink.textContent).toBe("GitHub project");
    expect(projectLink.href).toBe("https://github.com/example/jot");
    expect(projectLink.target).toBe("_blank");
    expect(projectLink.rel).toBe("noreferrer noopener");

    dispose();
  });

  it("toggles browser spellcheck", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(() => <Home />, host);
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.getAttribute("spellcheck")).toBe(
      "true"
    );

    openMenu(host);
    clickButton(host, "Turn spellcheck off");
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.getAttribute("spellcheck")).toBe(
      "false"
    );
    expect(testState.savedSettings.at(-1)).toMatchObject({ spellcheck: false });

    openMenu(host);
    clickButton(host, "Turn spellcheck on");
    await settle();

    expect(host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Mock WYSIWYG editor']")!.getAttribute("spellcheck")).toBe(
      "true"
    );
    expect(testState.savedSettings.at(-1)).toMatchObject({ spellcheck: true });

    dispose();
  });
});

function openMenu(host: ParentNode): void {
  host.querySelector<HTMLButtonElement>("button[aria-label='Open menu']")!.click();
}

function clickButton(host: ParentNode, label: string): void {
  const element = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.textContent?.includes(label)
  );
  expect(element).not.toBeNull();
  element!.click();
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}
