import {
  createMarkdownProtectedLineScanner,
  normalizeDailyNoteMarkdown,
  normalizeDailyNoteMarkdownAtCaret
} from "./dailyNoteMarkdown";

describe("daily note Markdown normalization", () => {
  it("keeps whitespace-only notes empty", () => {
    expect(normalizeDailyNoteMarkdown(" \n\t")).toBe("");
  });

  it("normalizes empty editor placeholders without creating consecutive blank lines", () => {
    expect(
      normalizeDailyNoteMarkdown(
        "before\n\n<br />\n\ninside\n* <br />\n* kept\n  * <br />\nafter\n",
        { normalizeEmptyEditorPlaceholders: true }
      )
    ).toBe("before\n\ninside\n* kept\nafter\n");
  });

  it("leaves empty editor placeholders untouched when normalization is disabled", () => {
    const markdown = "before\n<br />\n* <br />\nafter\n";
    expect(
      normalizeDailyNoteMarkdown(markdown, { normalizeEmptyEditorPlaceholders: false })
    ).toBe(markdown);
  });

  it("preserves an eligible placeholder on the collapsed caret line while canonicalizing the others", () => {
    const markdown = "before\n* <br />\n* <br />\n<br />\nafter\n";
    const activeItem = markdown.lastIndexOf("* <br />");

    expect(
      normalizeDailyNoteMarkdown(markdown, {
        normalizeEmptyEditorPlaceholders: true,
        preserveLineAt: activeItem + 2
      })
    ).toBe("before\n* <br />\n\nafter\n");
  });

  it("does not selectively normalize placeholders when the preference is disabled", () => {
    const markdown = "before\n* <br />\n* <br />\nafter\n";

    expect(
      normalizeDailyNoteMarkdown(markdown, {
        normalizeEmptyEditorPlaceholders: false,
        preserveLineAt: markdown.lastIndexOf("* <br />")
      })
    ).toBe(markdown);
  });

  it("maps the collapsed caret onto its retained line after removing preceding placeholders", () => {
    const markdown = "before\n* <br />\n* <br />\nafter\n";
    const caret = markdown.lastIndexOf("* <br />") + 2;

    expect(
      normalizeDailyNoteMarkdownAtCaret(markdown, caret, { normalizeEmptyEditorPlaceholders: true })
    ).toEqual({ markdown: "before\n* <br />\nafter\n", caret: "before\n* ".length });
  });

  it("maps the caret safely when the note already contains the internal offset marker text", () => {
    const marker = "jot-caret-line-marker-7f1c6df3";
    const markdown = `${marker}\n* <br />\n* <br />`;
    const caret = markdown.lastIndexOf("* <br />") + 2;

    expect(
      normalizeDailyNoteMarkdownAtCaret(markdown, caret, { normalizeEmptyEditorPlaceholders: true })
    ).toEqual({ markdown: `${marker}\n* <br />`, caret: `${marker}\n* `.length });
  });

  it("protects a raw HTML block when the caret is on its opening line", () => {
    const markdown = [
      "before",
      "<pre>",
      "<br />",
      "* <br />",
      "</pre>",
      "<br />",
      "after"
    ].join("\n");

    expect(
      normalizeDailyNoteMarkdown(markdown, {
        normalizeEmptyEditorPlaceholders: true,
        preserveLineAt: markdown.indexOf("<pre>") + 2
      })
    ).toBe([
      "before",
      "<pre>",
      "<br />",
      "* <br />",
      "</pre>",
      "",
      "after"
    ].join("\n"));
  });

  it("preserves placeholder-like text inside fenced and indented code blocks", () => {
    const markdown = [
      "before",
      "<br />",
      "",
      "```html",
      "<br />",
      "* <br />",
      "",
      "```",
      "",
      "<pre>",
      "<br />",
      "* <br />",
      "</pre>",
      "",
      "    <br />",
      "    * <br />",
      "",
      "    first indented code line",
      "",
      "",
      "",
      "    second indented code line",
      "",
      "after"
    ].join("\n");

    expect(
      normalizeDailyNoteMarkdown(markdown, { normalizeEmptyEditorPlaceholders: true })
    ).toBe([
      "before",
      "",
      "```html",
      "<br />",
      "* <br />",
      "",
      "```",
      "",
      "<pre>",
      "<br />",
      "* <br />",
      "</pre>",
      "",
      "    <br />",
      "    * <br />",
      "",
      "    first indented code line",
      "",
      "",
      "",
      "    second indented code line",
      "",
      "after"
    ].join("\n"));
  });
});

describe("Markdown protected line scanner", () => {
  it("protects placeholder-looking lines inside fenced code", () => {
    expect(lines(["```html", "* <br />", "```", "* <br />"])).toEqual([true, true, true, false]);
  });

  it("protects placeholder-looking lines inside indented code", () => {
    expect(lines(["    * <br />", "", "* <br />"])).toEqual([true, true, false]);
  });

  it("protects placeholder-looking lines inside raw HTML blocks", () => {
    expect(lines(["<pre>", "* <br />", "</pre>", "* <br />"])).toEqual([true, true, true, false]);
  });
});

function lines(markdownLines: readonly string[]): readonly boolean[] {
  const isProtected = createMarkdownProtectedLineScanner();
  return markdownLines.map((line) => isProtected(line));
}
