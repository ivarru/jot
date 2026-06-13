describe("mobile editor layout styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("uses a smaller dynamic mobile default editor height", () => {
    expect(mobileStyles()).toContain("--editor-default-height: 50dvh;");
  });

  it("keeps the page as the only scroll container for oversized Markdown", () => {
    expect(mobileStyles()).not.toMatch(/\.editor-shell[\s\S]*overflow:\s*auto/);
    expect(mobileStyles()).not.toMatch(/\.plain-text-editor[\s\S]*overflow:\s*auto/);
    expect(mobileStyles()).not.toMatch(/max-height:\s*var\(--editor-default-height\)/);
  });

  it("keeps the sync status aligned with the compact menu footprint when stacked", () => {
    expect(styles).toContain("--toolbar-compact-button-width: 28px;");
    expect(styles).toContain("--sync-status-size: 26px;");
    expect(mobileStyles()).not.toContain("--toolbar-compact-button-width:");
    expect(mobileStyles()).not.toContain("--sync-status-size:");
    expect(blockFor(".sync-status")).toContain("width: var(--sync-status-size);");
    expect(blockFor(".sync-status")).toContain("height: var(--sync-status-size);");
    expect(blockFor(".sync-status")).toContain("margin: 1px;");
    expect(blockIncluding(".icon-button.icon-menu-button")).toContain("width: var(--toolbar-compact-button-width);");
    expect(blockIncluding(".icon-button.icon-menu-button")).toContain("height: var(--toolbar-compact-button-width);");
    expect(blockIncluding(".toolbar-status-column .top-menu > .icon-button")).toContain(
      "width: var(--toolbar-compact-button-width);"
    );
    expect(blockIncluding(".toolbar-status-column .top-menu > .icon-button")).toContain(
      "height: var(--toolbar-compact-button-width);"
    );
  });

  it("uses a larger quote glyph without changing the shared icon button size", () => {
    expect(blockFor(".format-letter")).toContain("font-size: 14px;");
    expect(blockFor(".format-letter-quote")).toContain("font-size: 18px;");
    expect(mobileStyles()).toContain("width: 28px;");
    expect(mobileStyles()).toContain("height: 28px;");
  });

  function mobileStyles(): string {
    const start = styles.indexOf("@media (max-width: 720px)");
    const end = styles.indexOf("@media (max-width: 560px)");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end);
  }

  function blockFor(selector: string): string {
    const start = styles.startsWith(`${selector} {`)
      ? 0
      : lineStartFor(selector);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end + 1);
  }

  function lineStartFor(selector: string): number {
    const index = styles.indexOf(`\n${selector} {`);
    return index === -1 ? -1 : index + 1;
  }

  function blockIncluding(selector: string): string {
    for (const match of styles.matchAll(/(^|\n)([^{}]+)\s\{[^{}]*\}/g)) {
      const selectorText = match[2] ?? "";
      const selectors = selectorText.split(",").map((part) => part.trim());
      if (selectors.includes(selector)) return match[0] ?? "";
    }
    throw new Error(`CSS block not found for selector: ${selector}`);
  }
});
