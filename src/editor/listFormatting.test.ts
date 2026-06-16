import {
  markdownListItemFormatState,
  toggleMarkdownTaskListItem
} from "./listFormatting";

describe("list formatting", () => {
  it("turns the current bullet into an unchecked task item", () => {
    const markdown = "* abc";

    expect(toggleMarkdownTaskListItem(markdown, cursor(markdown, "ab"))).toEqual({
      markdown: "* [ ] abc",
      selection: {
        start: "* [ ] ab".length,
        end: "* [ ] ab".length
      }
    });
  });

  it("keeps a collapsed cursor ordered when adding a task marker at the text boundary", () => {
    const markdown = "* abc";

    expect(toggleMarkdownTaskListItem(markdown, { start: 2, end: 2 })).toEqual({
      markdown: "* [ ] abc",
      selection: {
        start: "* [ ] ".length,
        end: "* [ ] ".length
      }
    });
  });

  it("turns a nested bullet into an unchecked task item", () => {
    const markdown = "* parent\n  * child";

    expect(toggleMarkdownTaskListItem(markdown, cursor(markdown, "chi"))).toEqual({
      markdown: "* parent\n  * [ ] child",
      selection: {
        start: "* parent\n  * [ ] chi".length,
        end: "* parent\n  * [ ] chi".length
      }
    });
  });

  it("removes an existing checked task marker from the current bullet", () => {
    const markdown = "* [x] done";

    expect(toggleMarkdownTaskListItem(markdown, selection(markdown, "done"))).toEqual({
      markdown: "* done",
      selection: {
        start: "* ".length,
        end: "* done".length
      }
    });
  });

  it("adds missing task markers across selected bullet items", () => {
    const markdown = "* one\n  * two\nplain";

    expect(toggleMarkdownTaskListItem(markdown, selection(markdown, "one\n  * two"))).toEqual({
      markdown: "* [ ] one\n  * [ ] two\nplain",
      selection: {
        start: "* [ ] ".length,
        end: "* [ ] one\n  * [ ] two".length
      }
    });
  });

  it("turns the current normal line into an unchecked task item", () => {
    const markdown = "plain";

    expect(toggleMarkdownTaskListItem(markdown, cursor(markdown, "pla"))).toEqual({
      markdown: "* [ ] plain",
      selection: {
        start: "* [ ] pla".length,
        end: "* [ ] pla".length
      }
    });
  });

  it("reports task formatting active only when all selected bullet items are tasks", () => {
    expect(markdownListItemFormatState("* [ ] one\n  * [x] two", selection("* [ ] one\n  * [x] two", "one\n  * [x] two"))).toEqual({
      task: true
    });
    expect(markdownListItemFormatState("* [ ] one\n  * two", selection("* [ ] one\n  * two", "one\n  * two"))).toEqual({
      task: false
    });
    expect(markdownListItemFormatState("plain", cursor("plain", "pla"))).toEqual({
      task: false
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
