import { appendImageAttachmentReference } from "~/domain/attachmentReferences";
import {
  applyEditorChange,
  captureDocumentSnapshot,
  type DateBoundEditorState,
  type DateBoundEditorTransition,
  type VisibleDailyNoteSnapshot
} from "~/editor/dateBoundEditor";
import type { IsoDate } from "~/domain/dates";

export interface ImageAttachmentReferenceInsertion {
  readonly transition: DateBoundEditorTransition;
  readonly saveSnapshot: VisibleDailyNoteSnapshot;
}

export function commitImageAttachmentReferenceInsertion(input: {
  readonly editorState: DateBoundEditorState;
  readonly date: IsoDate | null;
  readonly markdownReference: string;
}): ImageAttachmentReferenceInsertion | null {
  if (input.date === null) return null;

  const markdown = appendImageAttachmentReference(input.editorState.markdown, input.markdownReference);
  const change = applyEditorChange(input.editorState, input.date, markdown);
  if (change.type !== "current-editor") return null;

  return {
    transition: {
      state: change.state,
      markdownWrite: change.markdownWrite
    },
    saveSnapshot: captureDocumentSnapshot(input.date, markdown)
  };
}
