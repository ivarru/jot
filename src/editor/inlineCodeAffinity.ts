export interface InlineCodeAffinityState {
  readonly position: number | null;
  readonly domInsideCode: boolean | null;
  readonly explicitInsideCode: boolean | null;
}

export const emptyInlineCodeAffinityState: InlineCodeAffinityState = {
  position: null,
  domInsideCode: null,
  explicitInsideCode: null
};

export function recordInlineCodeDomAffinity(
  state: InlineCodeAffinityState,
  position: number,
  insideCode: boolean
): InlineCodeAffinityState {
  return {
    position,
    domInsideCode: insideCode,
    explicitInsideCode: state.position === position ? state.explicitInsideCode : null
  };
}

export function recordInlineCodeExplicitAffinity(
  state: InlineCodeAffinityState,
  position: number,
  insideCode: boolean
): InlineCodeAffinityState {
  return {
    position,
    domInsideCode: state.position === position ? state.domInsideCode : null,
    explicitInsideCode: insideCode
  };
}

export function advanceInlineCodeAffinityAfterTextInput(
  state: InlineCodeAffinityState,
  from: number,
  to: number
): InlineCodeAffinityState {
  if (state.position !== from) return state;
  return { ...state, position: to };
}

export function resolveInlineCodeAffinity(
  state: InlineCodeAffinityState,
  position: number
): boolean | null {
  if (state.position !== position) return null;
  return state.explicitInsideCode ?? state.domInsideCode;
}

export function resolveInlineCodeExplicitAffinity(
  state: InlineCodeAffinityState,
  position: number
): boolean | null {
  if (state.position !== position) return null;
  return state.explicitInsideCode;
}
