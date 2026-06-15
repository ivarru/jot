import type { Ctx } from "@milkdown/kit/ctx";
import type { Node as ProseMirrorNode, NodeType, ResolvedPos } from "@milkdown/kit/prose/model";
import type { Command, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

type UseKeymap = typeof import("@milkdown/kit/utils").$useKeymap;
type ProsePluginFactory = typeof import("@milkdown/kit/utils").$prose;
type PluginConstructor = typeof import("@milkdown/kit/prose/state").Plugin;
type IsInTable = typeof import("@milkdown/kit/prose/tables").isInTable;
type SelectedRect = typeof import("@milkdown/kit/prose/tables").selectedRect;
type TextSelectionConstructor = typeof import("@milkdown/kit/prose/state").TextSelection;
type TableRect = ReturnType<SelectedRect>;

interface NodeSchemaProvider {
  type: (ctx: Ctx) => NodeType;
}

type TableBoundaryDirection = "before" | "after";

interface MilkdownTableBoundaryNavigationKeymapDependencies {
  readonly useKeymap: UseKeymap;
  readonly prose: ProsePluginFactory;
  readonly Plugin: PluginConstructor;
  readonly isInTable: IsInTable;
  readonly selectedRect: SelectedRect;
  readonly TextSelection: TextSelectionConstructor;
  readonly paragraphSchema: NodeSchemaProvider;
}

interface TableBoundary {
  readonly parent: ProseMirrorNode;
  readonly tableIndex: number;
  readonly before: number;
  readonly after: number;
}

export function createMilkdownTableBoundaryNavigation(
  deps: MilkdownTableBoundaryNavigationKeymapDependencies
) {
  const keymap = deps.useKeymap("jotTableBoundaryNavigationKeymap", {
    MoveBelowTableByTab: {
      shortcuts: "Tab",
      priority: 250,
      command: (ctx) =>
        createMoveAcrossTableBoundaryCommand({
          ...nodeTypes(ctx, deps),
          isInTable: deps.isInTable,
          selectedRect: deps.selectedRect,
          TextSelection: deps.TextSelection,
          direction: "after",
          isBoundaryRect: isAtLastTableCell
        })
    },
    MoveAboveTableByTab: {
      shortcuts: "Shift-Tab",
      priority: 250,
      command: (ctx) =>
        createMoveAcrossTableBoundaryCommand({
          ...nodeTypes(ctx, deps),
          isInTable: deps.isInTable,
          selectedRect: deps.selectedRect,
          TextSelection: deps.TextSelection,
          direction: "before",
          isBoundaryRect: isAtFirstTableCell
        })
    },
    MoveBelowTableByArrow: {
      shortcuts: "ArrowDown",
      priority: 250,
      command: (ctx) =>
        createMoveAcrossTableBoundaryCommand({
          ...nodeTypes(ctx, deps),
          isInTable: deps.isInTable,
          selectedRect: deps.selectedRect,
          TextSelection: deps.TextSelection,
          direction: "after",
          isBoundaryRect: isInLastTableRow
        })
    },
    MoveAboveTableByArrow: {
      shortcuts: "ArrowUp",
      priority: 250,
      command: (ctx) =>
        createMoveAcrossTableBoundaryCommand({
          ...nodeTypes(ctx, deps),
          isInTable: deps.isInTable,
          selectedRect: deps.selectedRect,
          TextSelection: deps.TextSelection,
          direction: "before",
          isBoundaryRect: isInTopTableRow
        })
    }
  });

  return [...keymap, createTableBoundaryArrowKeydownPlugin(deps)];
}

function nodeTypes(ctx: Ctx, deps: MilkdownTableBoundaryNavigationKeymapDependencies) {
  return {
    paragraphType: deps.paragraphSchema.type(ctx)
  };
}

function createMoveAcrossTableBoundaryCommand(deps: {
  readonly direction: TableBoundaryDirection;
  readonly isInTable: IsInTable;
  readonly selectedRect: SelectedRect;
  readonly isBoundaryRect: (rect: TableRect) => boolean;
  readonly TextSelection: TextSelectionConstructor;
  readonly paragraphType: NodeType;
}): Command {
  return (state, dispatch, view) => {
    if (!deps.isInTable(state)) return false;

    const rect = deps.selectedRect(state);
    if (!deps.isBoundaryRect(rect)) return false;

    if (dispatch !== undefined) {
      const boundary = tableBoundaryFromSelection(state.selection.$from, rect.table);
      if (boundary === null) return false;

      dispatch(moveSelectionAcrossBoundary(deps, state.tr, boundary).scrollIntoView());
    }

    return true;
  };
}

function createTableBoundaryArrowKeydownPlugin(
  deps: MilkdownTableBoundaryNavigationKeymapDependencies
): ReturnType<ProsePluginFactory> {
  return deps.prose((ctx) => {
    const moveBelowTable = createMoveAcrossTableBoundaryCommand({
      ...nodeTypes(ctx, deps),
      isInTable: deps.isInTable,
      selectedRect: deps.selectedRect,
      TextSelection: deps.TextSelection,
      direction: "after",
      isBoundaryRect: isInLastTableRow
    });
    const moveAboveTable = createMoveAcrossTableBoundaryCommand({
      ...nodeTypes(ctx, deps),
      isInTable: deps.isInTable,
      selectedRect: deps.selectedRect,
      TextSelection: deps.TextSelection,
      direction: "before",
      isBoundaryRect: isInTopTableRow
    });

    return new deps.Plugin({
      props: {
        handleDOMEvents: {
          keydown: (view, event) => {
            if (!(event instanceof KeyboardEvent)) return false;
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;

            const command =
              event.key === "ArrowDown" ? moveBelowTable : event.key === "ArrowUp" ? moveAboveTable : null;
            if (command === null) return false;

            const handled = command(view.state, view.dispatch, view);
            if (handled) event.preventDefault();
            return handled;
          }
        }
      }
    });
  });
}

function isAtFirstTableCell(rect: TableRect): boolean {
  return rect.top === 0 && rect.left === 0;
}

function isAtLastTableCell(rect: TableRect): boolean {
  return rect.bottom === rect.map.height && rect.right === rect.map.width;
}

function isInTopTableRow(rect: TableRect): boolean {
  return rect.top === 0;
}

function isInLastTableRow(rect: TableRect): boolean {
  return rect.bottom === rect.map.height;
}

function tableBoundaryFromSelection($from: ResolvedPos, table: ProseMirrorNode): TableBoundary | null {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth) !== table) continue;

    return {
      parent: $from.node(depth - 1),
      tableIndex: $from.index(depth - 1),
      before: $from.before(depth),
      after: $from.after(depth)
    };
  }

  return null;
}

function moveSelectionAcrossBoundary(
  deps: {
    readonly direction: TableBoundaryDirection;
    readonly TextSelection: TextSelectionConstructor;
    readonly paragraphType: NodeType;
  },
  tr: Transaction,
  boundary: TableBoundary
): Transaction {
  if (deps.direction === "before") {
    const previous = boundary.parent.maybeChild(boundary.tableIndex - 1);
    if (previous?.type === deps.paragraphType) {
      const previousStart = boundary.before - previous.nodeSize;
      return tr.setSelection(
        deps.TextSelection.create(tr.doc, previousStart + previous.content.size + 1)
      );
    }

    tr.insert(boundary.before, deps.paragraphType.create());
    return tr.setSelection(deps.TextSelection.create(tr.doc, boundary.before + 1));
  }

  const next = boundary.parent.maybeChild(boundary.tableIndex + 1);
  if (next?.type === deps.paragraphType) {
    return tr.setSelection(deps.TextSelection.create(tr.doc, boundary.after + 1));
  }

  tr.insert(boundary.after, deps.paragraphType.create());
  return tr.setSelection(deps.TextSelection.create(tr.doc, boundary.after + 1));
}
