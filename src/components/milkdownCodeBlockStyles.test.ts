describe("Milkdown code block styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("keeps ordinary editor content at the normal app width", () => {
    const rootRule = blockFor(":root");
    const appRule = blockFor(".app");
    const toolbarRule = blockFor(".app-toolbar");
    const editorShellRule = blockFor(".editor-shell");

    expect(rootRule).toContain("--app-max-width: 980px;");
    expect(rootRule).toContain("--app-half-max-width: 490px;");
    expect(rootRule).toContain("--app-padding-x: 18px;");
    expect(rootRule).toContain("--editor-border-width: 1px;");
    expect(appRule).toContain("width: min(var(--app-max-width), 100%);");
    expect(appRule).toContain("padding: 18px var(--app-padding-x);");
    expect(appRule).not.toContain("width: fit-content;");
    expect(toolbarRule).toContain(
      "margin: -6px var(--jot-editor-shell-margin-right, 0px) 10px var(--jot-editor-shell-margin-left, 0px);"
    );
    expect(editorShellRule).toContain("width: 100%;");
    expect(editorShellRule).toContain("margin-left: var(--jot-editor-shell-margin-left, 0px);");
    expect(editorShellRule).toContain("margin-right: var(--jot-editor-shell-margin-right, 0px);");
    expect(editorShellRule).not.toContain("width: max-content;");
  });

  it("lets Milkdown code blocks use viewport space without widening the editor", () => {
    const proseMirrorRule = blockFor(".milkdown-root .ProseMirror");
    const paragraphRule = blockFor(".milkdown-root :is(p, li)");
    const codeBlockRule = blockFor(".milkdown-root pre");
    const codeRule = blockFor(".milkdown-root pre code");

    expect(proseMirrorRule).toContain("max-width: 100%;");
    expect(paragraphRule).toContain("overflow-wrap: break-word;");
    expect(codeBlockRule).toContain("width: max-content;");
    expect(codeBlockRule).toContain("max-width: var(--jot-code-block-max-width, max(");
    expect(codeBlockRule).toContain("100vw - max(0px, 50vw - var(--app-half-max-width))");
    expect(codeBlockRule).toContain("var(--app-padding-x)");
    expect(codeBlockRule).toContain("var(--editor-padding)");
    expect(codeBlockRule).toContain("var(--editor-border-width)");
    expect(codeBlockRule).not.toContain("--jot-code-block-shift-left");
    expect(codeBlockRule).toContain("overflow-x: auto;");
    expect(codeRule).toContain("white-space: pre;");
  });

  it("updates the code block viewport cap for mobile app padding", () => {
    const mobileRule = mediaBlockFor("@media (max-width: 720px)");

    expect(mobileRule).toContain("--app-padding-x: 8px;");
    expect(mobileRule).toContain("padding: 10px var(--app-padding-x) 12px;");
  });

  function blockFor(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end + 1);
  }

  function mediaBlockFor(query: string): string {
    const start = styles.indexOf(query);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("@media", start + query.length);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end);
  }
});
