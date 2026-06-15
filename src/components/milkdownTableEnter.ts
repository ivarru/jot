import type { Ctx } from "@milkdown/kit/ctx";
import type { Node as ProseMirrorNode, NodeType } from "@milkdown/kit/prose/model";
import type { Command } from "@milkdown/kit/prose/state";

type UseKeymap = typeof import("@milkdown/kit/utils").$useKeymap;
type IsInTable = typeof import("@milkdown/kit/prose/tables").isInTable;
type SelectedRect = typeof import("@milkdown/kit/prose/tables").selectedRect;
type TextSelectionConstructor = typeof import("@milkdown/kit/prose/state").TextSelection;

interface NodeSchemaProvider {
  type: (ctx: Ctx) => NodeType;
}

interface MilkdownTableEnterKeymapDependencies {
  readonly useKeymap: UseKeymap;
  readonly isInTable: IsInTable;
  readonly selectedRect: SelectedRect;
  readonly TextSelection: TextSelectionConstructor;
  readonly tableCellSchema: NodeSchemaProvider;
  readonly tableRowSchema: NodeSchemaProvider;
  readonly paragraphSchema: NodeSchemaProvider;
}

export function createMilkdownTableEnterKeymap(deps: MilkdownTableEnterKeymapDependencies) {
  return deps.useKeymap("jotTableEnterKeymap", {
    InsertTableRowBelow: {
      shortcuts: "Enter",
      priority: 200,
      command: (ctx) =>
        createInsertTableRowBelowCommand({
          ...nodeTypes(ctx, deps),
          isInTable: deps.isInTable,
          selectedRect: deps.selectedRect,
          TextSelection: deps.TextSelection
        })
    }
  });
}

function nodeTypes(ctx: Ctx, deps: MilkdownTableEnterKeymapDependencies) {
  return {
    tableCellType: deps.tableCellSchema.type(ctx),
    tableRowType: deps.tableRowSchema.type(ctx),
    paragraphType: deps.paragraphSchema.type(ctx)
  };
}

function createInsertTableRowBelowCommand(deps: {
  readonly isInTable: IsInTable;
  readonly selectedRect: SelectedRect;
  readonly TextSelection: TextSelectionConstructor;
  readonly tableCellType: NodeType;
  readonly tableRowType: NodeType;
  readonly paragraphType: NodeType;
}): Command {
  return (state, dispatch) => {
    if (!deps.isInTable(state)) return false;

    if (dispatch !== undefined) {
      const rect = deps.selectedRect(state);
      const insertRowIndex = rect.bottom;
      const insertPosition = tableRowInsertPosition(rect.table, rect.tableStart, insertRowIndex);
      const row = createBlankBodyRow(deps, rect.table, rect.map.width);
      const tr = state.tr.insert(insertPosition, row);
      dispatch(
        tr
          .setSelection(deps.TextSelection.create(tr.doc, insertPosition + 4))
          .scrollIntoView()
      );
    }

    return true;
  };
}

function tableRowInsertPosition(table: ProseMirrorNode, tableStart: number, rowIndex: number): number {
  let position = tableStart;
  for (let index = 0; index < rowIndex; index += 1) {
    position += table.child(index).nodeSize;
  }
  return position;
}

function createBlankBodyRow(
  deps: {
    readonly tableCellType: NodeType;
    readonly tableRowType: NodeType;
    readonly paragraphType: NodeType;
  },
  table: ProseMirrorNode,
  columnCount: number
): ProseMirrorNode {
  const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
    const headerCell = table.child(0).child(columnIndex);
    return deps.tableCellType.create(
      { alignment: headerCell.attrs.alignment },
      deps.paragraphType.create(null, headerCell.type.schema.text(" "))
    );
  });

  return deps.tableRowType.create(null, cells);
}
