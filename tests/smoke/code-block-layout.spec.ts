import { expect, test, type Page } from "@playwright/test";

interface RectMetrics {
  readonly left: number;
  readonly right: number;
  readonly width: number;
}

interface LayoutMetrics {
  readonly viewportWidth: number;
  readonly documentWidth: number;
  readonly shell: RectMetrics;
  readonly toolbar: RectMetrics;
  readonly paragraph: RectMetrics & {
    readonly clientWidth: number;
    readonly scrollWidth: number;
  };
  readonly pre: RectMetrics & {
    readonly clientWidth: number;
    readonly scrollWidth: number;
  };
  readonly shellShift: string;
}

type CodeBlockLayoutExpectation = "pinned-left" | "centered";

test.use({
  viewport: {
    width: 2048,
    height: 900
  }
});

test("wide code blocks shift, recenter, and keep editor prose wrapped", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use development storage" }).click();
  await expect(page.locator(".milkdown-root [contenteditable=\"true\"]")).toBeVisible();

  const extreme = await setMarkdownAndMeasure(page, "abc ".repeat(220), "pinned-left");
  expect(extreme.shell.left, JSON.stringify(extreme)).toBeGreaterThanOrEqual(-1);
  expect(extreme.shell.left, JSON.stringify(extreme)).toBeLessThanOrEqual(1);
  expect(extreme.toolbar.left, JSON.stringify(extreme)).toBeGreaterThanOrEqual(-1);
  expect(extreme.toolbar.left, JSON.stringify(extreme)).toBeLessThanOrEqual(1);
  expect(extreme.pre.right, JSON.stringify(extreme)).toBeLessThanOrEqual(extreme.viewportWidth + 1);
  expect(extreme.documentWidth, JSON.stringify(extreme)).toBeLessThanOrEqual(extreme.viewportWidth + 1);

  const reduced = await setMarkdownAndMeasure(page, "abc ".repeat(38), "centered");
  expect(reduced.shell.left, JSON.stringify(reduced)).toBeGreaterThan(40);
  expect(Math.abs(reduced.toolbar.left - reduced.shell.left), JSON.stringify(reduced)).toBeLessThanOrEqual(1);
  expect(Math.abs(combinedLeftMargin(reduced) - combinedRightMargin(reduced)), JSON.stringify(reduced)).toBeLessThanOrEqual(2);
  expect(reduced.documentWidth, JSON.stringify(reduced)).toBeLessThanOrEqual(reduced.viewportWidth + 1);

  await appendWysiwygParagraphText(page, " appended-playwright-text" + " abc".repeat(24), "appended-playwright-text");
  const typed = await measureLayout(page);
  expect(typed.paragraph.right, JSON.stringify(typed)).toBeLessThanOrEqual(typed.shell.right + 1);
  expect(typed.paragraph.scrollWidth, JSON.stringify(typed)).toBeLessThanOrEqual(typed.paragraph.clientWidth + 1);
});

async function setMarkdownAndMeasure(
  page: Page,
  codeText: string,
  expectation: CodeBlockLayoutExpectation
): Promise<LayoutMetrics> {
  await switchToRawMode(page);
  await page.getByLabel("Markdown text editor").fill([
    "abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc abc",
    "",
    "```",
    codeText,
    "```",
    ""
  ].join("\n"));
  await switchToWysiwygMode(page);
  await expect(page.locator(".milkdown-root pre")).toBeVisible();
  await waitForCodeBlockLayout(page, codeText, expectation);

  const metrics = await measureLayout(page);
  expect(metrics.paragraph.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.paragraph.clientWidth + 1);
  expect(metrics.pre.right, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  return metrics;
}

async function switchToRawMode(page: Page): Promise<void> {
  const toggle = page.locator("button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]");
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
  await expect(page.getByLabel("Markdown text editor")).toBeVisible();
}

async function switchToWysiwygMode(page: Page): Promise<void> {
  const toggle = page.locator("button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]");
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  await expect(page.locator(".milkdown-root [contenteditable=\"true\"]")).toBeVisible();
}

async function waitForCodeBlockLayout(
  page: Page,
  codeText: string,
  expectation: CodeBlockLayoutExpectation
): Promise<void> {
  await page.waitForFunction(
    ({ expectedCodeText, expectedLayout }) => {
      const styleText = document.querySelector("style[data-jot-code-block-layout]")?.textContent ?? "";
      if (!styleText.includes("--jot-code-block-max-width")) return false;

      const shell = [...document.querySelectorAll(".editor-shell")].find((candidate) => {
        const box = candidate.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      const toolbar = document.querySelector(".app-toolbar");
      const paragraph = document.querySelector(".milkdown-root p");
      const pre = document.querySelector(".milkdown-root pre");
      if (
        !(shell instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) ||
        !(paragraph instanceof HTMLElement) ||
        !(pre instanceof HTMLElement)
      ) {
        return false;
      }

      if (pre.textContent?.trimEnd() !== expectedCodeText.trimEnd()) return false;

      const viewportWidth = window.innerWidth;
      const shellBox = shell.getBoundingClientRect();
      const toolbarBox = toolbar.getBoundingClientRect();
      const preBox = pre.getBoundingClientRect();
      if (paragraph.scrollWidth > paragraph.clientWidth + 1) return false;
      if (preBox.right > viewportWidth + 1) return false;
      if (document.documentElement.scrollWidth > viewportWidth + 1) return false;

      if (expectedLayout === "pinned-left") {
        return Math.abs(shellBox.left) <= 1 && Math.abs(toolbarBox.left) <= 1;
      }

      const leftMargin = Math.min(shellBox.left, preBox.left);
      const rightMargin = viewportWidth - Math.max(shellBox.right, preBox.right);
      return shellBox.left > 40 && Math.abs(toolbarBox.left - shellBox.left) <= 1 && Math.abs(leftMargin - rightMargin) <= 2;
    },
    { expectedCodeText: codeText, expectedLayout: expectation }
  );
}

async function appendWysiwygParagraphText(page: Page, text: string, expectedText: string): Promise<void> {
  const paragraph = page.locator(".milkdown-root p").first();
  await paragraph.evaluate((paragraphElement) => {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraphElement);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    (paragraphElement.closest(".ProseMirror") as HTMLElement | null)?.focus();
  });
  await page.keyboard.type(text);
  await expect(paragraph).toContainText(expectedText);
}

async function measureLayout(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    function rect(element: Element): RectMetrics {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width
      };
    }

    const shell = [...document.querySelectorAll(".editor-shell")].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const toolbar = document.querySelector(".app-toolbar");
    const paragraph = document.querySelector(".milkdown-root p");
    const pre = document.querySelector(".milkdown-root pre");
    if (!(shell instanceof HTMLElement) || !(toolbar instanceof HTMLElement) || !(paragraph instanceof HTMLElement) || !(pre instanceof HTMLElement)) {
      throw new Error("Could not find visible editor layout elements.");
    }

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      shell: rect(shell),
      toolbar: rect(toolbar),
      paragraph: {
        ...rect(paragraph),
        clientWidth: paragraph.clientWidth,
        scrollWidth: paragraph.scrollWidth
      },
      pre: {
        ...rect(pre),
        clientWidth: pre.clientWidth,
        scrollWidth: pre.scrollWidth
      },
      shellShift: getComputedStyle(shell).getPropertyValue("--jot-editor-shell-shift-left").trim()
    };
  });
}

function combinedLeftMargin(metrics: LayoutMetrics): number {
  return Math.min(metrics.shell.left, metrics.pre.left);
}

function combinedRightMargin(metrics: LayoutMetrics): number {
  return metrics.viewportWidth - Math.max(metrics.shell.right, metrics.pre.right);
}
