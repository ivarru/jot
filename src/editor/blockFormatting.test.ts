import {
  markdownBlockFormatState,
  toggleMarkdownBlockQuote
} from "./blockFormatting";

describe("block formatting", () => {
  it("quotes and unquotes selected lines", () => {
    const markdown = "first\nsecond";
    const quoted = toggleMarkdownBlockQuote(markdown, selection(markdown, "first\nsecond"));

    expect(quoted).toEqual({
      markdown: "> first\n> second",
      selection: {
        start: 2,
        end: "> first\n> second".length
      }
    });

    expect(toggleMarkdownBlockQuote(quoted.markdown, quoted.selection)).toEqual({
      markdown,
      selection: {
        start: 0,
        end: markdown.length
      }
    });
  });

  it("quotes the current line at a collapsed cursor", () => {
    const markdown = "first\nsecond";

    expect(toggleMarkdownBlockQuote(markdown, cursor(markdown, "sec"))).toEqual({
      markdown: "first\n> second",
      selection: {
        start: "first\n> sec".length,
        end: "first\n> sec".length
      }
    });
  });

  it("keeps a collapsed cursor after the inserted quote marker at the start of a line", () => {
    const markdown = "first";

    expect(toggleMarkdownBlockQuote(markdown, { start: 0, end: 0 })).toEqual({
      markdown: "> first",
      selection: {
        start: "> ".length,
        end: "> ".length
      }
    });
  });

  it("terminates a quoted line before an unquoted following line", () => {
    const markdown = "first\nsecond";
    const quoted = toggleMarkdownBlockQuote(markdown, selection(markdown, "first"));

    expect(quoted).toEqual({
      markdown: "> first\n\nsecond",
      selection: {
        start: 2,
        end: "> first".length
      }
    });
    expect(toggleMarkdownBlockQuote(quoted.markdown, quoted.selection)).toEqual({
      markdown: "first\n\nsecond",
      selection: {
        start: 0,
        end: "first".length
      }
    });
  });

  it("preserves existing paragraph separation when unquoting a selected line", () => {
    const markdown = "> first\n\nsecond";

    expect(toggleMarkdownBlockQuote(markdown, selection(markdown, "first"))).toEqual({
      markdown: "first\n\nsecond",
      selection: {
        start: 0,
        end: "first".length
      }
    });
  });

  it("reports block quote formatting active only when all selected lines are quoted", () => {
    expect(markdownBlockFormatState("> first\n> second", selection("> first\n> second", "first\n> second"))).toEqual({
      quote: true
    });
    expect(markdownBlockFormatState("first\n> second", selection("first\n> second", "first\n> second"))).toEqual({
      quote: false
    });
  });
});

function selection(markdown: string, text: string) {
  const start = markdown.indexOf(text);
  if (start === -1) throw new Error(`Text not found: ${text}`);
  return {
    start,
    end: start + text.length
  };
}

function cursor(markdown: string, textBeforeCursor: string) {
  const offset = markdown.indexOf(textBeforeCursor);
  if (offset === -1) throw new Error(`Text not found: ${textBeforeCursor}`);
  return {
    start: offset + textBeforeCursor.length,
    end: offset + textBeforeCursor.length
  };
}
