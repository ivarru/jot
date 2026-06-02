describe("plain text editor styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("suppresses the browser textarea focus outline", () => {
    const plainTextEditorRule = styles.match(/\.fallback-editor,\s*\.plain-text-editor\s*\{[\s\S]*?\}/)?.[0] ?? "";

    expect(plainTextEditorRule).toContain("outline: none;");
  });
});
