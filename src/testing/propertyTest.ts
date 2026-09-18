import type { Parameters } from "fast-check";

const DEFAULT_PROPERTY_SEED = 20_260_918;
const DEFAULT_PROPERTY_RUNS = 200;
const environment = (globalThis as typeof globalThis & {
  readonly process?: { readonly env?: Readonly<Record<string, string | undefined>> };
}).process?.env ?? {};

export function propertyTestParameters(): Parameters<unknown> {
  const seed = integerEnvironmentValue("FC_SEED") ?? DEFAULT_PROPERTY_SEED;
  const numRuns = integerEnvironmentValue("FC_NUM_RUNS") ?? DEFAULT_PROPERTY_RUNS;
  const path = environment.FC_PATH;

  return {
    seed,
    numRuns,
    ...(path === undefined || path === "" ? {} : { path })
  };
}

function integerEnvironmentValue(name: string): number | undefined {
  const value = environment[name];
  if (value === undefined || value === "") return undefined;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return parsed;
}
