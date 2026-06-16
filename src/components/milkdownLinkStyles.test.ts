describe("Milkdown link styles", () => {
  let styles = "";

  beforeAll(async () => {
    // @ts-expect-error Vitest runs in Node, but the app TypeScript config intentionally omits Node types.
    const { readFile } = await import("node:fs/promises");
    styles = await readFile("src/styles.css", "utf8");
  });

  it("shows pointer cursor for rendered links", () => {
    const linkRule = blockFor(".milkdown-root a");
    const internalDateRule = blockFor('.milkdown-root a[href^="#/date/"]');
    const relativeSectionRule = blockFor('.milkdown-root a[href^="#"]:not([href^="#/date/"])');

    expect(linkRule).toContain("cursor: pointer;");
    expect(internalDateRule).toContain("color: var(--link-internal);");
    expect(relativeSectionRule).toContain("color: var(--link-internal);");
  });

  function blockFor(selector: string): string {
    const start = styles.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = styles.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return styles.slice(start, end + 1);
  }
});
