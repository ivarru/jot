import { toggleCodeFormat } from "./codeToggle";

describe("code toggle", () => {
  it("wraps an inline selection in backticks", () => {
    const markdown = "Use foo today";

    expect(toggleCodeFormat(markdown, selection(markdown, "foo"))).toEqual({
      markdown: "Use `foo` today",
      selection: {
        start: "Use `".length,
        end: "Use `foo".length
      }
    });
  });

  it("uses a longer inline marker when the selection contains backticks", () => {
    const markdown = "Use a`b today";

    expect(toggleCodeFormat(markdown, selection(markdown, "a`b"))).toEqual({
      markdown: "Use ``a`b`` today",
      selection: {
        start: "Use ``".length,
        end: "Use ``a`b".length
      }
    });
  });

  it("pads inline code when boundary backticks would merge with the marker", () => {
    const markdown = "Use `literal` here";

    expect(toggleCodeFormat(markdown, selection(markdown, "`literal`"))).toEqual({
      markdown: "Use `` `literal` `` here",
      selection: {
        start: "Use `` ".length,
        end: "Use `` `literal`".length
      }
    });
  });

  it("inserts inline code markers at a collapsed cursor", () => {
    const markdown = "Use  today";

    expect(toggleCodeFormat(markdown, { start: "Use ".length, end: "Use ".length })).toEqual({
      markdown: "Use `` today",
      selection: {
        start: "Use `".length,
        end: "Use `".length
      }
    });
  });

  it("removes empty inline code markers at a collapsed cursor", () => {
    const markdown = "Use `` today";

    expect(toggleCodeFormat(markdown, { start: "Use `".length, end: "Use `".length })).toEqual({
      markdown: "Use  today",
      selection: {
        start: "Use ".length,
        end: "Use ".length
      }
    });
  });

  it("leaves non-empty inline code unchanged at a collapsed cursor", () => {
    const markdown = "Use `foo` today";
    const cursor = "Use `f".length;

    expect(toggleCodeFormat(markdown, { start: cursor, end: cursor })).toEqual({
      markdown,
      selection: {
        start: cursor,
        end: cursor
      }
    });
  });

  it("leaves fenced code unchanged at a collapsed cursor", () => {
    const markdown = "```\nfoo\n```";
    const cursor = "```\nf".length;

    expect(toggleCodeFormat(markdown, { start: cursor, end: cursor })).toEqual({
      markdown,
      selection: {
        start: cursor,
        end: cursor
      }
    });
  });

  it("wraps a multiline selection in a fenced code block", () => {
    const markdown = "before\nselected\ntext\nafter";

    expect(toggleCodeFormat(markdown, selection(markdown, "selected\ntext"))).toEqual({
      markdown: "before\n```\nselected\ntext\n```\nafter",
      selection: {
        start: "before\n```\n".length,
        end: "before\n```\nselected\ntext".length
      }
    });
  });

  it("keeps fenced code markers on their own lines for mid-line multiline selections", () => {
    const markdown = "xx foo\nbar yy";

    expect(toggleCodeFormat(markdown, selection(markdown, "foo\nbar"))).toEqual({
      markdown: "xx \n```\nfoo\nbar\n```\n yy",
      selection: {
        start: "xx \n```\n".length,
        end: "xx \n```\nfoo\nbar".length
      }
    });
  });

  it("removes code formatting from a whole inline code selection", () => {
    const markdown = "Use `foo` today";

    expect(toggleCodeFormat(markdown, selection(markdown, "foo"))).toEqual({
      markdown: "Use foo today",
      selection: {
        start: "Use ".length,
        end: "Use foo".length
      }
    });
  });

  it("removes code formatting from the middle of an inline code span", () => {
    const markdown = "`foo bar baz`";

    expect(toggleCodeFormat(markdown, selection(markdown, "bar"))).toEqual({
      markdown: "`foo `bar` baz`",
      selection: {
        start: "`foo `".length,
        end: "`foo `bar".length
      }
    });
  });

  it("removes code formatting from a whole fenced code selection", () => {
    const markdown = "```\nfoo\n```";

    expect(toggleCodeFormat(markdown, selection(markdown, "foo"))).toEqual({
      markdown: "foo",
      selection: {
        start: 0,
        end: "foo".length
      }
    });
  });

  it("removes code formatting from the middle of a fenced code block", () => {
    const markdown = "```\nfoo\nbar\nbaz\n```";

    expect(toggleCodeFormat(markdown, selection(markdown, "bar"))).toEqual({
      markdown: "```\nfoo\n```\nbar\n```\nbaz\n```",
      selection: {
        start: "```\nfoo\n```\n".length,
        end: "```\nfoo\n```\nbar".length
      }
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
