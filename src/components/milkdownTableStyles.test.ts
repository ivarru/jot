describe("Milkdown table styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("makes WYSIWYG tables visually distinct", () => {
    const tableRule = styles.match(/\.milkdown-root table\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const cellRule = styles.match(/\.milkdown-root :is\(th,\s*td\)\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const cellParagraphRule = styles.match(/\.milkdown-root :is\(th,\s*td\) > p\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const headerRule = styles.match(/\.milkdown-root th\s*\{[\s\S]*?\}/)?.[0] ?? "";

    expect(tableRule).toContain("width: max-content;");
    expect(tableRule).toContain("max-width: 100%;");
    expect(tableRule).toContain("border-collapse: collapse;");
    expect(tableRule).toContain("border:");
    expect(cellRule).toContain("border:");
    expect(cellRule).toContain("padding: 0 6px;");
    expect(cellRule).toContain("line-height: 1.15;");
    expect(cellRule).not.toContain("min-width:");
    expect(cellParagraphRule).toContain("margin: 0;");
    expect(cellParagraphRule).toContain("line-height: inherit;");
    expect(cellParagraphRule).toContain("min-height: 1.15em;");
    expect(headerRule).toContain("background:");
    expect(headerRule).toContain("font-weight:");
  });
});
