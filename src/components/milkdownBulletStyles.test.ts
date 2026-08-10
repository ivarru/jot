describe("Milkdown bullet styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("renders the fourth nesting level as a hollow square", () => {
    const fourthLevelRule = blockFor(".milkdown-root ul ul ul ul .jot-bullet-marker::before");

    expect(fourthLevelRule).toContain("border: 1.5px solid currentColor;");
    expect(fourthLevelRule).toContain("border-radius: 2px;");
    expect(fourthLevelRule).toContain("background: transparent;");
  });

  it("returns to a filled circle at the fifth nesting level", () => {
    const fifthLevelRule = blockFor(".milkdown-root ul ul ul ul ul .jot-bullet-marker::before");

    expect(fifthLevelRule).toContain("border: 0;");
    expect(fifthLevelRule).toContain("border-radius: 999px;");
    expect(fifthLevelRule).toContain("background: currentColor;");
  });

  function blockFor(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end + 1);
  }
});
