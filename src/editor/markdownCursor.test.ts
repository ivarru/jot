import {
  markdownSourceOffsetToRenderedOffset,
  renderedOffsetToMarkdownSourceOffset
} from "./markdownCursor";

describe("markdown cursor mapping", () => {
  it("maps heading source offsets to rendered text offsets", () => {
    const markdown = "# Heading";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe("Heading".length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, "Heading".length)).toBe(markdown.length);
  });

  it("maps list item source offsets to rendered text offsets", () => {
    const markdown = "- first\n- second";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.indexOf("second"))).toBe("first\n\n".length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, "first\n\nsecond".length)).toBe(markdown.length);
  });

  it("does not accumulate list item cursor drift across long lists", () => {
    const items = Array.from({ length: 12 }, (_item, index) => `- item ${index + 1}`);
    const markdown = items.join("\n");
    const renderedBeforeLastItem = Array.from({ length: 11 }, (_item, index) => `item ${index + 1}`).join("\n\n");
    const lastItemSourceOffset = markdown.indexOf("item 12");

    expect(markdownSourceOffsetToRenderedOffset(markdown, lastItemSourceOffset)).toBe(
      `${renderedBeforeLastItem}\n\n`.length
    );
    expect(renderedOffsetToMarkdownSourceOffset(markdown, `${renderedBeforeLastItem}\n\nitem 12`.length)).toBe(
      markdown.length
    );
  });

  it("maps link destinations as hidden syntax", () => {
    const markdown = "See [Jot](https://example.com) now";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.indexOf(" now"))).toBe("See Jot".length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, "See Jot".length)).toBe(markdown.indexOf(" now"));
  });

  it("keeps literal brackets visible", () => {
    const markdown = "Remember [draft]";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe(markdown.length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, markdown.indexOf("[") + 1)).toBe(markdown.indexOf("[") + 1);
  });

  it("keeps literal marker characters visible", () => {
    const markdown = "foo_bar and 2 * 3 and `";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe(markdown.length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, markdown.indexOf("*") + 1)).toBe(markdown.indexOf("*") + 1);
  });

  it("keeps Markdown markers inside inline code visible", () => {
    const markdown = "`*literal*`";
    const rendered = "*literal*";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe(rendered.length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, rendered.indexOf("*") + 1)).toBe(markdown.indexOf("*") + 1);
  });

  it("maps rendered inline code start boundaries to content instead of the opening marker", () => {
    const markdown = "Use `foo` today";

    expect(renderedOffsetToMarkdownSourceOffset(markdown, "Use ".length)).toBe("Use `".length);
  });

  it("keeps Markdown prefixes inside indented code blocks visible", () => {
    const markdown = "    # not a heading\n    - not a list";
    const rendered = "# not a heading\n- not a list";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe(rendered.length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, rendered.indexOf("#") + 1)).toBe(markdown.indexOf("#") + 1);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, rendered.indexOf("-") + 1)).toBe(markdown.indexOf("-") + 1);
  });

  it("maps GFM table cell text", () => {
    const markdown = "| A | B |\n| - | - |\n| c | d |";
    const rendered = "A\nB\nc\nd";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe(rendered.length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, rendered.indexOf("c") + 1)).toBe(markdown.indexOf("c") + 1);
  });

  it("maps fenced code content after the opening fence metadata", () => {
    const markdown = "```js\njs\n```";
    const rendered = "js";

    expect(markdownSourceOffsetToRenderedOffset(markdown, markdown.length)).toBe(rendered.length);
    expect(renderedOffsetToMarkdownSourceOffset(markdown, rendered.length)).toBe(markdown.indexOf("\njs") + 3);
  });
});
