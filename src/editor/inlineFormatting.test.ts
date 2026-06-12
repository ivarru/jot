import {
  markdownInlineFormatState,
  toggleMarkdownInlineMark
} from "./inlineFormatting";

describe("inline formatting", () => {
  it("wraps and unwraps selected text with italic markers", () => {
    const markdown = "Use emphasis today";

    expect(toggleMarkdownInlineMark(markdown, selection(markdown, "emphasis"), "italic")).toEqual({
      markdown: "Use *emphasis* today",
      selection: {
        start: "Use *".length,
        end: "Use *emphasis".length
      }
    });

    expect(toggleMarkdownInlineMark("Use *emphasis* today", selection("Use *emphasis* today", "emphasis"), "italic")).toEqual({
      markdown: "Use emphasis today",
      selection: {
        start: "Use ".length,
        end: "Use emphasis".length
      }
    });
  });

  it("wraps and unwraps selected text with bold markers", () => {
    const markdown = "Use strong today";

    expect(toggleMarkdownInlineMark(markdown, selection(markdown, "strong"), "bold")).toEqual({
      markdown: "Use **strong** today",
      selection: {
        start: "Use **".length,
        end: "Use **strong".length
      }
    });

    expect(toggleMarkdownInlineMark("Use **strong** today", selection("Use **strong** today", "strong"), "bold")).toEqual({
      markdown: "Use strong today",
      selection: {
        start: "Use ".length,
        end: "Use strong".length
      }
    });
  });

  it("does not wrap multi-paragraph selections with inline emphasis markers", () => {
    const markdown = "first\n\nsecond";
    const selected = { start: 0, end: markdown.length };

    expect(toggleMarkdownInlineMark(markdown, selected, "bold")).toEqual({
      markdown,
      selection: selected
    });
    expect(toggleMarkdownInlineMark(markdown, selected, "italic")).toEqual({
      markdown,
      selection: selected
    });
  });

  it("reports active inline formatting at the cursor", () => {
    const markdown = "Use *emphasis*, **strong**, and `code` today";

    expect(markdownInlineFormatState(markdown, cursor(markdown, "emphasis"))).toEqual({
      italic: true,
      bold: false,
      code: false
    });
    expect(markdownInlineFormatState(markdown, cursor(markdown, "strong"))).toEqual({
      italic: false,
      bold: true,
      code: false
    });
    expect(markdownInlineFormatState(markdown, cursor(markdown, "code"))).toEqual({
      italic: false,
      bold: false,
      code: true
    });
  });

  it("reports active inline formatting only when the whole raw selection is formatted", () => {
    const markdown = "plain **bold** text";

    expect(markdownInlineFormatState(markdown, selection(markdown, "bold"))).toEqual({
      italic: false,
      bold: true,
      code: false
    });
    expect(markdownInlineFormatState(markdown, {
      start: markdown.indexOf("plain"),
      end: markdown.indexOf("bold") + "bo".length
    })).toEqual({
      italic: false,
      bold: false,
      code: false
    });
  });
});

function selection(markdown: string, selected: string): { readonly start: number; readonly end: number } {
  const start = markdown.indexOf(selected);
  if (start === -1) throw new Error(`Selection text not found: ${selected}`);
  return {
    start,
    end: start + selected.length
  };
}

function cursor(markdown: string, inside: string): { readonly start: number; readonly end: number } {
  const start = markdown.indexOf(inside);
  if (start === -1) throw new Error(`Cursor text not found: ${inside}`);
  const offset = start + 1;
  return {
    start: offset,
    end: offset
  };
}
