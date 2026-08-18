import { compactMarkdownLists } from "./compactLists";

describe("compactMarkdownLists", () => {
  it("removes blank lines between list items at every nesting level", () => {
    expect(compactMarkdownLists([
      "* one",
      "",
      "* two",
      "",
      "  1. nested one",
      "",
      "  2. nested two",
      "",
      "* [ ] three",
      "",
      "* [x] four"
    ].join("\n"))).toBe([
      "* one",
      "* two",
      "  1. nested one",
      "  2. nested two",
      "* [ ] three",
      "* [x] four"
    ].join("\n"));
  });

  it("keeps intentional paragraph breaks inside a list item", () => {
    expect(compactMarkdownLists([
      "* first paragraph",
      "",
      "  second paragraph",
      "",
      "* next item"
    ].join("\n"))).toBe([
      "* first paragraph",
      "",
      "  second paragraph",
      "* next item"
    ].join("\n"));
  });

  it("does not reformat Markdown that has no loose list gaps", () => {
    const markdown = "Before\n\n* one\n* two\n\nAfter\n";
    expect(compactMarkdownLists(markdown)).toBe(markdown);
  });
});
