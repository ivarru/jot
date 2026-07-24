import {
  extractJotTags,
  filterJotTagSuggestions,
  insertJotTagAtSelection,
  jotTagMarkdown,
  normalizeJotTagName
} from "./jotTags";

describe("Jot tags", () => {
  it("uses ordinary Markdown links with a Jot tag destination", () => {
    expect(jotTagMarkdown("project-alpha")).toBe("[#project-alpha](jot:tag/project-alpha)");
    expect(normalizeJotTagName("  Project Alpha  ")).toBe("project-alpha");
    expect(normalizeJotTagName("wrong/tag")).toBeNull();
  });

  it("extracts canonical tag links without treating examples or code as tags", () => {
    const markdown = [
      "A [#project-alpha](jot:tag/project-alpha) and [label](jot:tag/research).",
      "",
      "`[#inline](jot:tag/inline)`",
      "",
      "```md",
      "[#example](jot:tag/example)",
      "```",
      "",
      "[#not-canonical](https://example.com)"
    ].join("\n");

    expect(extractJotTags(markdown)).toEqual(["project-alpha", "research"]);
  });

  it("inserts a tag at the cursor without replacing selected text", () => {
    expect(insertJotTagAtSelection("Review this item", { start: 7, end: 11 }, "follow-up")).toEqual({
      markdown: "Review this [#follow-up](jot:tag/follow-up) item",
      selection: { start: 43, end: 43 }
    });
  });

  it("adds only the spacing needed around the inserted tag", () => {
    expect(insertJotTagAtSelection("Review", { start: 6, end: 6 }, "later")).toEqual({
      markdown: "Review [#later](jot:tag/later)",
      selection: { start: 30, end: 30 }
    });
    expect(insertJotTagAtSelection("Review now", { start: 6, end: 6 }, "later").markdown).toBe(
      "Review [#later](jot:tag/later) now"
    );
  });

  it("filters suggestions by the normalized prefix the user typed", () => {
    const suggestions = ["project-alpha", "research", "release-notes", "testing"];

    expect(filterJotTagSuggestions(suggestions, "")).toEqual(suggestions);
    expect(filterJotTagSuggestions(suggestions, "Re")).toEqual(["research", "release-notes"]);
    expect(filterJotTagSuggestions(suggestions, "project ")).toEqual(["project-alpha"]);
    expect(filterJotTagSuggestions(suggestions, "wrong/")).toEqual([]);
  });
});
