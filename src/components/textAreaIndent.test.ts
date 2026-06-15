import { textAreaStructuralTabAction } from "./textAreaIndent";

describe("text area structural tab editing", () => {
  it("turns a hard-break paragraph into a list item with indented continuation lines", () => {
    const markdown = "abc\ndef\\\nghi";

    const action = textAreaStructuralTabAction(markdown, "abc".length, "abc".length, false);

    expect(applyAction(markdown, action)).toBe("* abc\n  def\\\n  ghi");
  });

  it("keeps the raw cursor with the same paragraph text when listifying from a continuation line", () => {
    const markdown = "abc\ndef\\\nghi";

    const action = textAreaStructuralTabAction(markdown, "abc\ndef".length, "abc\ndef".length, false);

    expect(applyAction(markdown, action)).toBe("* abc\n  def\\\n  ghi");
    expect(action.type).toBe("edit");
    if (action.type === "edit") {
      expect(action.edit.selectionStart).toBe("* abc\n  def".length);
      expect(action.edit.selectionEnd).toBe("* abc\n  def".length);
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
});

function applyAction(
  markdown: string,
  action: ReturnType<typeof textAreaStructuralTabAction>
): string {
  if (action.type === "noop") return markdown;
  return `${markdown.slice(0, action.edit.start)}${action.edit.replacement}${markdown.slice(action.edit.end)}`;
}
