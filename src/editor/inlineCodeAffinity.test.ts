import {
  emptyInlineCodeAffinityState,
  advanceInlineCodeAffinityAfterTextInput,
  recordInlineCodeDomAffinity,
  recordInlineCodeExplicitAffinity,
  resolveInlineCodeAffinity,
  resolveInlineCodeExplicitAffinity,
  type InlineCodeAffinityState
} from "./inlineCodeAffinity";

type Action =
  | { readonly type: "dom"; readonly position: number; readonly insideCode: boolean }
  | { readonly type: "explicit"; readonly position: number; readonly insideCode: boolean };

const actions: readonly Action[] = [0, 1].flatMap((position) => [
  { type: "dom", position, insideCode: false } as const,
  { type: "dom", position, insideCode: true } as const,
  { type: "explicit", position, insideCode: false } as const,
  { type: "explicit", position, insideCode: true } as const
]);

describe("inline-code boundary affinity", () => {
  it("matches the intent model for every event trace through length five", () => {
    for (const trace of actionTraces(5)) {
      const state = trace.reduce(applyAction, emptyInlineCodeAffinityState);
      const currentPosition = trace.at(-1)!.position;

      expect(resolveInlineCodeAffinity(state, currentPosition), formatTrace(trace)).toBe(expectedAffinity(trace));
      expect(resolveInlineCodeExplicitAffinity(state, currentPosition), formatTrace(trace)).toBe(
        expectedExplicitAffinity(trace)
      );
      expect(resolveInlineCodeAffinity(state, currentPosition === 0 ? 1 : 0), formatTrace(trace)).toBeNull();
      expect(resolveInlineCodeExplicitAffinity(state, currentPosition === 0 ? 1 : 0), formatTrace(trace)).toBeNull();
    }
  });

  it("keeps an explicit toolbar or input-rule exit outside through repeated same-position DOM reports", () => {
    for (const initialDomInsideCode of [false, true]) {
      for (let repeatCount = 0; repeatCount <= 20; repeatCount += 1) {
        let state = recordInlineCodeDomAffinity(emptyInlineCodeAffinityState, 4, initialDomInsideCode);
        state = recordInlineCodeExplicitAffinity(state, 4, false);
        for (let repeat = 0; repeat < repeatCount; repeat += 1) {
          state = recordInlineCodeDomAffinity(state, 4, true);
        }

        expect(resolveInlineCodeAffinity(state, 4)).toBe(false);
      }
    }
  });

  it("carries explicit formatting intent across any number of typed characters", () => {
    for (const insideCode of [false, true]) {
      for (let characterCount = 1; characterCount <= 100; characterCount += 1) {
        let state = recordInlineCodeExplicitAffinity(emptyInlineCodeAffinityState, 10, insideCode);
        for (let index = 0; index < characterCount; index += 1) {
          state = advanceInlineCodeAffinityAfterTextInput(state, 10 + index, 11 + index);
          state = recordInlineCodeDomAffinity(state, 11 + index, !insideCode);
        }

        expect(resolveInlineCodeAffinity(state, 10 + characterCount)).toBe(insideCode);
      }
    }
  });
});

function applyAction(state: InlineCodeAffinityState, action: Action): InlineCodeAffinityState {
  return action.type === "dom"
    ? recordInlineCodeDomAffinity(state, action.position, action.insideCode)
    : recordInlineCodeExplicitAffinity(state, action.position, action.insideCode);
}

function expectedAffinity(trace: readonly Action[]): boolean {
  const currentPosition = trace.at(-1)!.position;
  let lastMove = -1;
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    if (trace[index]!.position !== currentPosition) {
      lastMove = index;
      break;
    }
  }
  const atCurrentPosition = trace.slice(lastMove + 1);
  let explicit: Action | undefined;
  for (let index = atCurrentPosition.length - 1; index >= 0; index -= 1) {
    if (atCurrentPosition[index]!.type === "explicit") {
      explicit = atCurrentPosition[index];
      break;
    }
  }
  return (explicit ?? atCurrentPosition.at(-1)!).insideCode;
}

function expectedExplicitAffinity(trace: readonly Action[]): boolean | null {
  const currentPosition = trace.at(-1)!.position;
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const action = trace[index]!;
    if (action.position !== currentPosition) return null;
    if (action.type === "explicit") return action.insideCode;
  }
  return null;
}

function* actionTraces(maxLength: number): Generator<readonly Action[]> {
  let current: readonly Action[][] = [[]];
  for (let length = 1; length <= maxLength; length += 1) {
    current = current.flatMap((prefix) => actions.map((action) => [...prefix, action]));
    yield* current;
  }
}

function formatTrace(trace: readonly Action[]): string {
  return trace
    .map((action) => `${action.type}@${action.position}:${action.insideCode ? "code" : "plain"}`)
    .join(" -> ");
}
