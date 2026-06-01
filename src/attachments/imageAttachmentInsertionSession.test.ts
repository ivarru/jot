import type { DateBoundEditorState } from "~/editor/dateBoundEditor";
import { commitImageAttachmentReferenceInsertion } from "./imageAttachmentInsertionSession";

describe("Image Attachment insertion session", () => {
  it("appends an Attachment Reference through the selected Daily Note session", () => {
    expect(
      commitImageAttachmentReferenceInsertion({
        editorState: state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "before",
          cleanMarkdown: "before",
          editorChangeEpoch: 3
        }),
        date: "2030-02-02",
        markdownReference: "![Trail](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
      })
    ).toEqual({
      transition: {
        state: {
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "before\n\n![Trail](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)",
          cleanMarkdown: null,
          editorChangeEpoch: 4
        },
        markdownWrite: {
          source: "editor",
          markdown: "before\n\n![Trail](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
        }
      },
      saveSnapshot: {
        date: "2030-02-02",
        markdown: "before\n\n![Trail](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
      }
    });
  });

  it("does not insert into a stale Daily Note date", () => {
    expect(
      commitImageAttachmentReferenceInsertion({
        editorState: state({
          selectedDate: "2030-02-02",
          loadedDate: "2030-02-02",
          markdown: "visible"
        }),
        date: "2030-02-01",
        markdownReference: "![Old](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
      })
    ).toBeNull();
  });

  it("does not insert before the selected Daily Note is loaded", () => {
    expect(
      commitImageAttachmentReferenceInsertion({
        editorState: state({
          selectedDate: "2030-02-02",
          loadedDate: null,
          markdown: ""
        }),
        date: "2030-02-02",
        markdownReference: "![Trail](jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A)"
      })
    ).toBeNull();
  });
});

function state(overrides: Partial<DateBoundEditorState>): DateBoundEditorState {
  return {
    selectedDate: null,
    loadedDate: null,
    markdown: "",
    cleanMarkdown: null,
    editorChangeEpoch: 0,
    ...overrides
  };
}
