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

  function mobileStyles(): string {
    const start = styles.indexOf("@media (max-width: 720px)");
    const end = styles.indexOf("@media (max-width: 560px)");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end);
  }
});
