import { normalizeDailyNoteMarkdown } from "./dailyNoteMarkdown";

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
