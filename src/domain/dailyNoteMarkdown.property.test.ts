import fc from "fast-check";
import {
  literalMarkdownRegionArbitrary,
  markdownArbitrary,
  normalizationPolicyCaseArbitrary
} from "~/testing/markdownArbitraries";
import { propertyTestParameters } from "~/testing/propertyTest";
import { normalizeDailyNoteMarkdown } from "./dailyNoteMarkdown";

describe("daily note Markdown normalization properties", () => {
  it("is idempotent with persistence normalization enabled and disabled", () => {
    fc.assert(
      fc.property(markdownArbitrary, (markdown) => {
        for (const normalizeEmptyEditorPlaceholders of [false, true]) {
          const once = normalizeDailyNoteMarkdown(markdown, { normalizeEmptyEditorPlaceholders });
          const twice = normalizeDailyNoteMarkdown(once, { normalizeEmptyEditorPlaceholders });
          expect(twice).toBe(once);
        }
      }),
      propertyTestParameters()
    );
  });

  it("preserves literal fenced-code and HTML regions when normalization is enabled", () => {
    fc.assert(
      fc.property(literalMarkdownRegionArbitrary, (literalRegion) => {
        const input = `before\n* <br />\n${literalRegion}\n<br />\nafter`;
        const normalized = normalizeDailyNoteMarkdown(input, { normalizeEmptyEditorPlaceholders: true });
        expect(normalized).toContain(literalRegion);
      }),
      propertyTestParameters()
    );
  });

  it("applies distinct enabled and disabled persistence policies", () => {
    fc.assert(
      fc.property(normalizationPolicyCaseArbitrary, ({ input, enabledExpected, literalRegion }) => {
        expect(normalizeDailyNoteMarkdown(input, { normalizeEmptyEditorPlaceholders: false })).toBe(input);
        const enabled = normalizeDailyNoteMarkdown(input, { normalizeEmptyEditorPlaceholders: true });
        expect(enabled).toBe(enabledExpected);
        expect(enabled).toContain(literalRegion);
        expect(enabled).not.toBe(input);
      }),
      propertyTestParameters()
    );
  });
});
