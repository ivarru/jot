import { toggleLinkAtCursor } from "./linkToggle";

describe("link toggle", () => {
  it("converts a simple URL link to a full Markdown link using the URL slug", () => {
    expect(toggleLinkAtCursor("Read <https://example.com/docs/sync-model> today", 18)).toEqual({
      markdown: "Read [sync-model](<https://example.com/docs/sync-model>) today",
      cursorOffset: "Read [sync-model".length
    });
  });

  it("uses the last non-empty path part before query and hash as the link text", () => {
    expect(toggleLinkAtCursor("<https://example.com/releases/0.6.1/?from=app#notes>", 10)).toEqual({
      markdown: "[0.6.1](<https://example.com/releases/0.6.1/?from=app#notes>)",
      cursorOffset: "[0.6.1".length
    });
  });

  it("escapes generated Markdown link labels from decoded URL slugs", () => {
    expect(toggleLinkAtCursor("<https://example.com/a%5Db%5Bc%5C>", 10)).toEqual({
      markdown: "[a\\]b\\[c\\\\](<https://example.com/a%5Db%5Bc%5C>)",
      cursorOffset: "[a\\]b\\[c\\\\".length
    });
  });

  it("uses the raw URL slug when percent escapes are malformed", () => {
    expect(toggleLinkAtCursor("<https://example.com/%E0%A4%A>", 10)).toEqual({
      markdown: "[%E0%A4%A](<https://example.com/%E0%A4%A>)",
      cursorOffset: "[%E0%A4%A".length
    });
  });

  it("wraps generated destinations so closing parentheses stay inside the URL", () => {
    const full = toggleLinkAtCursor("<https://example.com/foo)bar>", 10);

    expect(full).toEqual({
      markdown: "[foo)bar](<https://example.com/foo)bar>)",
      cursorOffset: "[foo)bar".length
    });
    expect(toggleLinkAtCursor(full!.markdown, full!.markdown.indexOf("foo)bar>"))).toEqual({
      markdown: "<https://example.com/foo)bar>",
      cursorOffset: "<https://example.com/foo)bar".length
    });
  });

  it("wraps generated destinations so unbalanced opening parentheses stay inside the URL", () => {
    const full = toggleLinkAtCursor("<https://example.com/foo(bar>", 10);

    expect(full).toEqual({
      markdown: "[foo(bar](<https://example.com/foo(bar>)",
      cursorOffset: "[foo(bar".length
    });
    expect(toggleLinkAtCursor(full!.markdown, full!.markdown.indexOf("foo(bar>"))).toEqual({
      markdown: "<https://example.com/foo(bar>",
      cursorOffset: "<https://example.com/foo(bar".length
    });
  });

  it("round-trips a generated link with escaped label characters", () => {
    const full = toggleLinkAtCursor("<https://example.com/a%5Db>", 10);

    expect(full).toEqual({
      markdown: "[a\\]b](<https://example.com/a%5Db>)",
      cursorOffset: "[a\\]b".length
    });
    expect(toggleLinkAtCursor(full!.markdown, "[a\\]".length)).toEqual({
      markdown: "<https://example.com/a%5Db>",
      cursorOffset: "<https://example.com/a%5Db".length
    });
  });

  it("round-trips a generated link with parentheses in the URL", () => {
    const full = toggleLinkAtCursor("<https://en.wikipedia.org/wiki/Function_(mathematics)>", 10);

    expect(full).toEqual({
      markdown: "[Function_(mathematics)](<https://en.wikipedia.org/wiki/Function_(mathematics)>)",
      cursorOffset: "[Function_(mathematics)".length
    });
    expect(toggleLinkAtCursor(full!.markdown, full!.markdown.lastIndexOf("(mathematics)") + 2)).toEqual({
      markdown: "<https://en.wikipedia.org/wiki/Function_(mathematics)>",
      cursorOffset: "<https://en.wikipedia.org/wiki/Function_(mathematics)".length
    });
  });

  it("converts a full Markdown link back to a simple URL link", () => {
    expect(toggleLinkAtCursor("Read [sync model](https://example.com/docs/sync-model) today", 15)).toEqual({
      markdown: "Read <https://example.com/docs/sync-model> today",
      cursorOffset: "Read <https://example.com/docs/sync-model".length
    });
  });

  it("converts a full Markdown link when the cursor is inside its URL", () => {
    expect(toggleLinkAtCursor("[sync model](https://example.com/docs/sync-model)", 20)).toEqual({
      markdown: "<https://example.com/docs/sync-model>",
      cursorOffset: "<https://example.com/docs/sync-model".length
    });
  });

  it("does nothing when the cursor is outside a link", () => {
    expect(toggleLinkAtCursor("Read https://example.com/docs/sync-model today", 2)).toBeNull();
  });

  it("does not treat non-URL angle brackets as a simple link", () => {
    expect(toggleLinkAtCursor("Use <daily-note> here", 7)).toBeNull();
  });
});
