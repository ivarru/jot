import { textAreaStructuralTabAction, textAreaStructuralTabAvailability } from "./textAreaIndent";

describe("text area structural tab editing", () => {
  it("listifies only the current textual line in a multiline paragraph", () => {
    const markdown = "foo\nbar\nbaz";

    const action = textAreaStructuralTabAction(markdown, "foo\nba".length, "foo\nba".length, false);

    expect(applyAction(markdown, action)).toBe("foo\n* bar\nbaz");
  });

  it("keeps the raw cursor with the current line when listifying a multiline paragraph", () => {
    const markdown = "foo\nbar\nbaz";

    const action = textAreaStructuralTabAction(markdown, "foo\nba".length, "foo\nba".length, false);

    expect(applyAction(markdown, action)).toBe("foo\n* bar\nbaz");
    expect(action.type).toBe("edit");
    if (action.type === "edit") {
      expect(action.edit.selectionStart).toBe("foo\n* ba".length);
      expect(action.edit.selectionEnd).toBe("foo\n* ba".length);
    }
  });

  it.each([
    ["header", "| A | B |", false],
    ["delimiter", "| --- | --- |", false],
    ["body", "| one | two |", false],
    ["body shift-tab", "| one | two |", true]
  ])("does not structurally tab inside a GFM table %s row", (_name, selectedLine, shiftKey) => {
    const markdown = "| A | B |\n| --- | --- |\n| one | two |";
    const cursor = markdown.indexOf(selectedLine) + selectedLine.indexOf("|", 1);

    expect(textAreaStructuralTabAction(markdown, cursor, cursor, shiftKey)).toEqual({ type: "noop" });
  });

  it("moves through the reversible heading chain below the preceding heading", () => {
    const parent = "## Parent\n";
    expect(applyAtEnd(`${parent}Paragraph`, true)).toBe(`${parent}### Paragraph`);
    expect(applyAtEnd(`${parent}### Heading`, true)).toBe(`${parent}## Heading`);
    expect(applyAtEnd(`${parent}## Heading`, true)).toBe(`${parent}# Heading`);
    expect(applyAtEnd(`${parent}# Heading`, false)).toBe(`${parent}## Heading`);
    expect(applyAtEnd(`${parent}## Heading`, false)).toBe(`${parent}### Heading`);
    expect(applyAtEnd(`${parent}### Heading`, false)).toBe(`${parent}Heading`);
  });

  it("does not treat headings inside fences as preceding headings", () => {
    const markdown = "```\n###### code\n```\nParagraph";
    expect(applyAtEnd(markdown, true)).toBe("```\n###### code\n```\n# Paragraph");
  });

  it.each([
    ["<div>\n###### example\n</div>\n\nParagraph"],
    ["    ###### example\n\nParagraph"],
    ["\t###### example\n\nParagraph"]
  ])("does not treat headings inside protected blocks as context in %s", (markdown) => {
    expect(applyAtEnd(markdown, true)).toBe(`${markdown.slice(0, -"Paragraph".length)}# Paragraph`);
  });

  it.each([
    ["Parent\n======\nParagraph", "Parent\n======\n## Paragraph"],
    ["Parent\n------\nParagraph", "Parent\n------\n### Paragraph"]
  ])("recognizes a preceding Setext heading in %s", (markdown, expected) => {
    expect(applyAtEnd(markdown, true)).toBe(expected);
  });

  it("reports unavailable heading boundaries", () => {
    expect(textAreaStructuralTabAvailability("# Heading", 3)).toEqual({ canIndent: true, canDedent: false });
    expect(textAreaStructuralTabAvailability("###### Parent\nParagraph", 20)).toEqual({
      canIndent: true,
      canDedent: false
    });
  });
});

function applyAtEnd(markdown: string, shiftKey: boolean): string {
  return applyAction(markdown, textAreaStructuralTabAction(markdown, markdown.length, markdown.length, shiftKey));
}

function applyAction(
  markdown: string,
  action: ReturnType<typeof textAreaStructuralTabAction>
): string {
  if (action.type === "noop") return markdown;
  return `${markdown.slice(0, action.edit.start)}${action.edit.replacement}${markdown.slice(action.edit.end)}`;
}
