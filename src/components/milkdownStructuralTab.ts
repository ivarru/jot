import type { Ctx } from "@milkdown/kit/ctx";
import type { NodeType, ResolvedPos } from "@milkdown/kit/prose/model";
import type { Command, Transaction } from "@milkdown/kit/prose/state";

type UseKeymap = typeof import("@milkdown/kit/utils").$useKeymap;
type IsInTable = typeof import("@milkdown/kit/prose/tables").isInTable;
type ListItemCommandFactory = typeof import("@milkdown/kit/prose/schema-list").sinkListItem;
type TextSelectionConstructor = typeof import("@milkdown/kit/prose/state").TextSelection;
type WrapIn = typeof import("@milkdown/kit/prose/commands").wrapIn;

interface NodeSchemaProvider {
  type: (ctx: Ctx) => NodeType;
}

interface MilkdownStructuralTabKeymapDependencies {
  readonly useKeymap: UseKeymap;
  readonly isInTable: IsInTable;
  readonly sinkListItem: ListItemCommandFactory;
  readonly liftListItem: ListItemCommandFactory;
  readonly wrapIn: WrapIn;
  readonly TextSelection: TextSelectionConstructor;
  readonly listItemSchema: NodeSchemaProvider;
  readonly bulletListSchema: NodeSchemaProvider;
  readonly codeBlockSchema: NodeSchemaProvider;
  readonly headingSchema: NodeSchemaProvider;
  readonly paragraphSchema: NodeSchemaProvider;
}

interface StructuralTabCommandDependencies {
  readonly shiftKey: boolean;
  readonly isInTable: IsInTable;
  readonly sinkListItem: ListItemCommandFactory;
  readonly liftListItem: ListItemCommandFactory;
  readonly wrapIn: WrapIn;
  readonly TextSelection: TextSelectionConstructor;
  readonly listItemType: NodeType;
  readonly bulletListType: NodeType;
  readonly codeBlockType: NodeType;
  readonly headingType: NodeType;
  readonly paragraphType: NodeType;
}

export function createMilkdownStructuralTabKeymap(deps: MilkdownStructuralTabKeymapDependencies) {
  return deps.useKeymap("jotStructuralTabKeymap", {
    Indent: {
      shortcuts: "Tab",
      priority: 200,
      command: (ctx) =>
        createStructuralTabCommand({
          ...nodeTypes(ctx, deps),
          ...deps,
          shiftKey: false
        })
    },
    Dedent: {
      shortcuts: "Shift-Tab",
      priority: 200,
      command: (ctx) =>
        createStructuralTabCommand({
          ...nodeTypes(ctx, deps),
          ...deps,
          shiftKey: true
        })
    }
  });
}

function nodeTypes(ctx: Ctx, deps: MilkdownStructuralTabKeymapDependencies) {
  return {
    listItemType: deps.listItemSchema.type(ctx),
    bulletListType: deps.bulletListSchema.type(ctx),
    codeBlockType: deps.codeBlockSchema.type(ctx),
    headingType: deps.headingSchema.type(ctx),
    paragraphType: deps.paragraphSchema.type(ctx)
  };
}

function createStructuralTabCommand(deps: StructuralTabCommandDependencies): Command {
  return (state, dispatch, view) => {
    if (deps.isInTable(state)) return false;

    if (isSelectionInListItem(state.selection.$from, deps.listItemType)) {
      const command = deps.shiftKey ? deps.liftListItem(deps.listItemType) : deps.sinkListItem(deps.listItemType);
      command(state, dispatch, view);
      return true;
    }

    const currentBlock = state.selection.$from.parent;
    if (currentBlock.type === deps.codeBlockType) {
      return updateCodeBlockLineIndent(deps, state, dispatch);
    }

    if (currentBlock.type === deps.headingType) {
      return updateHeadingDepth(deps, state, dispatch);
    }

    if (!deps.shiftKey && currentBlock.type === deps.paragraphType) {
      deps.wrapIn(deps.bulletListType)(state, dispatch, view);
      return true;
    }

    if (deps.shiftKey && currentBlock.type === deps.paragraphType) {
      dispatch?.(
        state.tr
          .setBlockType(state.selection.from, state.selection.to, deps.headingType, { level: 1 })
          .scrollIntoView()
      );
      return true;
    }

    return true;
  };
}

function updateCodeBlockLineIndent(
  deps: StructuralTabCommandDependencies,
  state: Parameters<Command>[0],
  dispatch: Parameters<Command>[1]
): boolean {
  const lineStart = codeBlockLineStart(state.selection.$from.parent.textContent, state.selection.$from.parentOffset);
  const start = state.selection.$from.start() + lineStart;

  if (!deps.shiftKey) {
    if (dispatch !== undefined) {
      const tr = state.tr.insertText("  ", start, start);
      setMappedTextSelection(deps, state, tr, 1);
      dispatch(tr.scrollIntoView());
    }
    return true;
  }

  const textAfterLineStart = state.selection.$from.parent.textContent.slice(lineStart);
  const removeCount = Math.min(2, textAfterLineStart.match(/^ */)?.[0].length ?? 0);
  if (removeCount === 0) return true;

  if (dispatch !== undefined) {
    const tr = state.tr.delete(start, start + removeCount);
    setMappedTextSelection(deps, state, tr, -1);
    dispatch(tr.scrollIntoView());
  }
  return true;
}

function updateHeadingDepth(
  deps: StructuralTabCommandDependencies,
  state: Parameters<Command>[0],
  dispatch: Parameters<Command>[1]
): boolean {
  const heading = state.selection.$from.parent;
  const level = Number(heading.attrs.level ?? 1);

  if (deps.shiftKey) {
    const nextLevel = Math.min(6, level + 1);
    if (nextLevel === level) return true;
    dispatch?.(
      state.tr
        .setNodeMarkup(state.selection.$from.before(), undefined, {
          ...heading.attrs,
          level: nextLevel
        })
        .scrollIntoView()
    );
    return true;
  }

  if (level <= 1) {
    dispatch?.(state.tr.setBlockType(state.selection.from, state.selection.to, deps.paragraphType).scrollIntoView());
    return true;
  }

  dispatch?.(
    state.tr
      .setNodeMarkup(state.selection.$from.before(), undefined, {
        ...heading.attrs,
        level: level - 1
      })
      .scrollIntoView()
  );
  return true;
}

function setMappedTextSelection(
  deps: StructuralTabCommandDependencies,
  state: Parameters<Command>[0],
  tr: Transaction,
  bias: -1 | 1
): void {
  const from = clampPosition(tr.mapping.map(state.selection.from, bias), tr.doc.content.size);
  const to = clampPosition(tr.mapping.map(state.selection.to, bias), tr.doc.content.size);
  tr.setSelection(deps.TextSelection.create(tr.doc, from, to));
}

function codeBlockLineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function isSelectionInListItem($from: ResolvedPos, listItemType: NodeType): boolean {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === listItemType) return true;
  }
  return false;
}

function clampPosition(position: number, docSize: number): number {
  return Math.max(0, Math.min(docSize, position));
}
