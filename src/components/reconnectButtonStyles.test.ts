describe("reconnect button styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("uses dedicated reconnect colors in both light and dark modes", () => {
    expect(styles).toContain("--reconnect-bg: #b45309;");
    expect(styles).toContain("--reconnect-text: #fff7ed;");
    expect(darkModeStyles()).toContain("--reconnect-bg: #f59e0b;");
    expect(darkModeStyles()).toContain("--reconnect-text: #2b1700;");
  });

  it("does not reuse the standard accent button colors", () => {
    expect(reconnectButtonStyles()).toContain("background: var(--reconnect-bg);");
    expect(reconnectButtonStyles()).toContain("color: var(--reconnect-text);");
    expect(reconnectButtonStyles()).not.toContain("background: var(--accent);");
    expect(reconnectButtonStyles()).not.toContain("color: var(--accent-contrast);");
  });

  function reconnectButtonStyles(): string {
    return blockFor(".toolbar-reconnect-button");
  }

  function darkModeStyles(): string {
    const start = styles.indexOf("@media (prefers-color-scheme: dark)");
    const end = styles.indexOf("* {");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end);
  }

  function blockFor(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end + 1);
  }
});
