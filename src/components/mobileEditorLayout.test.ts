describe("mobile editor layout styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("reduces the default editor height to the remaining small-screen viewport", () => {
    expect(mobileStyles()).toContain("--editor-default-height: min(65vh, calc(100svh - 132px));");
  });

  it("keeps the page as the only scroll container for oversized Markdown", () => {
    expect(mobileStyles()).not.toMatch(/\.editor-shell[\s\S]*overflow:\s*auto/);
    expect(mobileStyles()).not.toMatch(/\.plain-text-editor[\s\S]*overflow:\s*auto/);
    expect(mobileStyles()).not.toMatch(/max-height:\s*var\(--editor-default-height\)/);
  });

  function mobileStyles(): string {
    const start = styles.indexOf("@media (max-width: 720px)");
    const end = styles.indexOf("@media (max-width: 560px)");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end);
  }
});
