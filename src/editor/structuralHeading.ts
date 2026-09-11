export type StructuralHeadingTarget =
  | { readonly type: "heading"; readonly level: number }
  | { readonly type: "paragraph" }
  | { readonly type: "list-item" }
  | { readonly type: "noop" };

export interface StructuralTabAvailability {
  readonly canIndent: boolean;
  readonly canDedent: boolean;
}

export const availableStructuralTabs: StructuralTabAvailability = {
  canIndent: true,
  canDedent: true
};

export function structuralHeadingTarget(
  currentLevel: number | null,
  previousLevel: number | null,
  shiftKey: boolean
): StructuralHeadingTarget {
  if (currentLevel === null) {
    if (!shiftKey) return { type: "list-item" };
    if (previousLevel === 6) return { type: "noop" };
    return { type: "heading", level: previousLevel === null ? 1 : previousLevel + 1 };
  }

  if (shiftKey) {
    return currentLevel === 1
      ? { type: "noop" }
      : { type: "heading", level: currentLevel - 1 };
  }

  if (previousLevel === null || previousLevel < currentLevel) return { type: "paragraph" };
  return currentLevel === 6
    ? { type: "noop" }
    : { type: "heading", level: currentLevel + 1 };
}

export function structuralHeadingAvailability(
  currentLevel: number | null,
  previousLevel: number | null
): StructuralTabAvailability {
  return {
    canIndent: structuralHeadingTarget(currentLevel, previousLevel, false).type !== "noop",
    canDedent: structuralHeadingTarget(currentLevel, previousLevel, true).type !== "noop"
  };
}
