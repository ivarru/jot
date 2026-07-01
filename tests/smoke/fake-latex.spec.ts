import { expect, test } from "@playwright/test";
import {
  expectRawMarkdown,
  openDevelopmentStorage,
  setRawMarkdown,
  switchToRawMode,
  switchToWysiwygMode
} from "./helpers/editor";

const formulaMarkdown = [
  "Inline $$E = mc^2$$ formula.",
  "",
  "$$\\gdef\\foo{x}$$",
  "",
  "$$\\foo + 1$$",
  "",
  "$$\\int_0^1 x^2 dx$$"
].join("\n");

test("fake storage renders LaTeX formulas and preserves Markdown", async ({ page }) => {
  await openDevelopmentStorage(page);
  await setRawMarkdown(page, formulaMarkdown);
  await switchToWysiwygMode(page);

  const inlineFormula = page.locator(".milkdown-math-inline");
  await expect(inlineFormula.locator(".katex")).toBeVisible();
  await expect(inlineFormula).toHaveAttribute("data-value", "E = mc^2");

  const blockFormulas = page.locator(".milkdown-math-block");
  const macroUseFormula = blockFormulas.nth(1);
  await expect(macroUseFormula).toHaveAttribute("data-value", "\\foo + 1");
  await expect(macroUseFormula.locator(".katex-html")).toContainText("x+1");

  const blockFormula = blockFormulas.nth(2);
  await expect(blockFormula.locator(".katex-display")).toBeVisible();
  await expect(blockFormula).toHaveAttribute("data-value", "\\int_0^1 x^2 dx");

  await switchToRawMode(page);
  await expectRawMarkdown(page, formulaMarkdown);
});
