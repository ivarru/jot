import fc from "fast-check";
import { markdownArbitrary } from "~/testing/markdownArbitraries";
import { propertyTestParameters } from "~/testing/propertyTest";
import { mergeDailyNote } from "./merge";

describe("daily note merge properties", () => {
  it("returns the changed side or shared change without conflicts", () => {
    fc.assert(
      fc.property(markdownArbitrary, markdownArbitrary, (baseline, changed) => {
        expectCleanMerge({ baseline, local: changed, remote: baseline }, changed);
        expectCleanMerge({ baseline, local: baseline, remote: changed }, changed);
        expectCleanMerge({ baseline, local: changed, remote: changed }, changed);
      }),
      propertyTestParameters()
    );
  });
});

function expectCleanMerge(
  input: { readonly baseline: string; readonly local: string; readonly remote: string },
  expected: string
): void {
  const result = mergeDailyNote(input);
  expect(result.mergedMarkdown).toBe(expected);
  expect(result.unresolvedHunks).toEqual([]);
  expect(result.conflicted).toBe(false);
}
