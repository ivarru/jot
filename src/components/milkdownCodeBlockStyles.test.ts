describe("Milkdown code block styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("lets the editor widen for code blocks until the viewport is the constraint", () => {
    const appRule = blockFor(".app");
    const editorShellRule = blockFor(".editor-shell");

    expect(appRule).toContain("width: fit-content;");
    expect(appRule).toContain("min-width: min(980px, 100%);");
    expect(appRule).toContain("max-width: 100%;");
    expect(editorShellRule).toContain("width: max-content;");
    expect(editorShellRule).toContain("min-width: 100%;");
    expect(editorShellRule).toContain("max-width: 100%;");
  });

  it("contains long Milkdown code lines with a horizontal scrollbar", () => {
    const codeBlockRule = blockFor(".milkdown-root pre");
    const codeRule = blockFor(".milkdown-root pre code");

    expect(codeBlockRule).toContain("width: max-content;");
    expect(codeBlockRule).toContain("max-width: 100%;");
    expect(codeBlockRule).toContain("overflow-x: auto;");
    expect(codeRule).toContain("white-space: pre;");
  });

  function blockFor(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end + 1);
  }
});
