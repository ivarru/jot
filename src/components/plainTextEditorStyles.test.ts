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

  it("keeps hard line break highlights behind the raw textarea", () => {
    const highlightRule = styles.match(/\.plain-text-hard-break-highlights\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const markerRule = styles.match(/\.markdown-hard-break-spaces\s*\{[\s\S]*?\}/)?.[0] ?? "";
    const rawTextareaRule = styles.match(/\.plain-text-editor\s*\{[\s\S]*?\}/)?.[0] ?? "";

    expect(highlightRule).toContain("position: absolute;");
    expect(highlightRule).toContain("pointer-events: none;");
    expect(highlightRule).toContain("white-space: pre-wrap;");
    expect(markerRule).toContain("background:");
    expect(rawTextareaRule).toContain("z-index: 1;");
  });
});
