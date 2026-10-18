import { completeJotTagPrefix } from "./jotTags";
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

it("completes only the additional shared prefix of canonical tag matches", () => {
  const tags = ["project-alpha", "project-alpine", "research"];
  expect(completeJotTagPrefix(tags, "PROJ")).toBe("project-alp");
  expect(completeJotTagPrefix(tags, "project-alp")).toBeNull();
  expect(completeJotTagPrefix(tags, "project-a" )).toBe("project-alp");
  expect(completeJotTagPrefix(tags, "research")).toBeNull();
  expect(completeJotTagPrefix(tags, "res")).toBe("research");
  expect(completeJotTagPrefix(tags, "wrong")).toBeNull();
  expect(completeJotTagPrefix(tags, "invalid/")).toBeNull();
});

it.each([
  ["# Heading", 4, "# Heading\n\nTAG"],
  ["Heading\n=======\n\nNext", 3, "Heading\n=======\n\nTAG\n\nNext"],
  ["Read [docs](https://example.com) now", 9, "Read [docs](https://example.com) TAG now"],
  ["Read `code` now", 8, "Read `code` TAG now"],
  ["`code`[docs](https://example.com)", 3, "`code` TAG [docs](https://example.com)"],
  ["Read [docs][ref] now\n\n[ref]: https://example.com", 9, "Read [docs][ref] TAG now\n\n[ref]: https://example.com"],
  ["```js\ncode\n```\n\nNext", 8, "```js\ncode\n```\n\nTAG\n\nNext"],
  ["```js\ncode", 8, "```js\ncode\n```\n\nTAG"],
  ["> # Heading\n>\n> Next", 6, "> # Heading\n> \n> TAG\n>\n> Next"],
  ["- # Heading\n\n  Next", 6, "- # Heading\n  \n  TAG\n\n  Next"],
])("inserts after an incompatible element: %s", (source, offset, expected) => {
  const result = insertJotTagAtSelection(source as string, { start: offset as number, end: offset as number }, "work");
  expect(result.markdown).toBe((expected as string).replace("TAG", jotTagMarkdown("work")));
  expect(extractJotTags(result.markdown)).toEqual(["work"]);
  const tagEnd = result.markdown.indexOf(jotTagMarkdown("work")) + jotTagMarkdown("work").length;
  expect([tagEnd, tagEnd + 1]).toContain(result.selection.start);
  expect(result.selection.end).toBe(result.selection.start);
  expect(result.markdown.slice(tagEnd, result.selection.start).trim()).toBe("");
});

it("extracts reference-style tags with CommonMark's first-definition rule", () => {
  const source = [
    "Context [#work][w], [shortcut], and [collapsed][].",
    "",
    "[w]: jot:tag/work",
    "[W]: https://example.com",
    "[shortcut]: jot:tag/shortcut",
    "[collapsed]: jot:tag/collapsed",
    "[ordinary]: https://example.com",
    "[ordinary]: jot:tag/incorrect",
    "",
    "[Not a tag][ordinary] and `[#example][w]`.",
    "",
    "```md",
    "[#code][w]",
    "```"
  ].join("\n");
  expect(extractJotTags(source)).toEqual(["work", "shortcut", "collapsed"]);
});
