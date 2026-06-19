const CODE_BLOCK_MAX_WIDTH_PROPERTY = "--jot-code-block-max-width";
const EDITOR_SHELL_SHIFT_LEFT_PROPERTY = "--jot-editor-shell-shift-left";
const EDITOR_SHELL_MARGIN_LEFT_PROPERTY = "--jot-editor-shell-margin-left";
const EDITOR_SHELL_MARGIN_RIGHT_PROPERTY = "--jot-editor-shell-margin-right";
const CODE_BLOCK_LAYOUT_ROOT_ATTRIBUTE = "data-jot-code-block-layout-root";
const CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE = "data-jot-code-block-layout-shell";

interface CodeBlockEditorShellShiftInput {
  readonly shellLeftPx: number;
  readonly shellRightPx: number;
  readonly codeBlockLeftPx: number;
  readonly intrinsicWidthPx: number;
  readonly viewportWidthPx: number;
}

interface EditorViewWithDomObserverControls {
  readonly domObserver?: {
    readonly start?: () => void;
    readonly stop?: () => void;
  };
}

interface CodeBlockViewportLayoutRoot {
  readonly id: string;
  readonly style: HTMLStyleElement;
  shiftTargets: readonly HTMLElement[];
}

interface MeasuredCodeBlock {
  readonly selector: string;
  readonly leftPx: number;
  readonly intrinsicWidthPx: number;
}

const codeBlockViewportLayoutRoots = new WeakMap<HTMLElement, CodeBlockViewportLayoutRoot>();
let codeBlockViewportLayoutSequence = 0;

export function codeBlockEditorShellShift(input: CodeBlockEditorShellShiftInput): number {
  const shellLeftPx = Math.max(0, input.shellLeftPx);
  const shellRightPx = Math.max(shellLeftPx, input.shellRightPx);
  const shellWidthPx = shellRightPx - shellLeftPx;
  const codeBlockLeftPx = input.codeBlockLeftPx;
  const intrinsicWidthPx = Math.max(0, input.intrinsicWidthPx);
  const codeBlockRightPx = codeBlockLeftPx + intrinsicWidthPx;
  const rightOverflowPx = Math.max(0, codeBlockRightPx - shellRightPx);
  if (rightOverflowPx <= 0) return 0;

  const combinedWidthPx = shellWidthPx + rightOverflowPx;
  const centeredShellLeftPx = (input.viewportWidthPx - combinedWidthPx) / 2;
  const shiftLeftPx = shellLeftPx - centeredShellLeftPx;
  return Math.max(0, Math.min(shellLeftPx, shiftLeftPx));
}

export function codeBlockViewportMaxWidth(input: {
  readonly codeBlockLeftPx: number;
  readonly shellShiftLeftPx: number;
  readonly viewportWidthPx: number;
}): number {
  return Math.max(0, input.viewportWidthPx - (input.codeBlockLeftPx - input.shellShiftLeftPx));
}

export function createMilkdownCodeBlockViewportLayout(root: HTMLElement): () => void {
  let animationFrame: number | null = null;
  const trackedCodeBlocks = new Set<HTMLElement>();
  const layoutRoot = ensureCodeBlockViewportLayoutRoot(root);

  function scheduleUpdate() {
    if (animationFrame !== null) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      updateMilkdownCodeBlockViewportLayout(root);
      if (resizeObserver !== null) {
        for (const codeBlock of root.querySelectorAll<HTMLElement>("pre")) {
          if (trackedCodeBlocks.has(codeBlock)) continue;
          trackedCodeBlocks.add(codeBlock);
          resizeObserver.observe(codeBlock);
        }
      }
    });
  }

  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => scheduleUpdate());

  const mutationObserver = new MutationObserver(scheduleUpdate);
  mutationObserver.observe(root, {
    childList: true,
    characterData: true,
    subtree: true
  });
  resizeObserver?.observe(root);
  window.addEventListener("resize", scheduleUpdate);
  scheduleUpdate();

  return () => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", scheduleUpdate);
    if (codeBlockViewportLayoutRoots.get(root) === layoutRoot) {
      codeBlockViewportLayoutRoots.delete(root);
      root.removeAttribute(CODE_BLOCK_LAYOUT_ROOT_ATTRIBUTE);
      for (const target of layoutRoot.shiftTargets) {
        if (target.getAttribute(CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE) === layoutRoot.id) {
          target.removeAttribute(CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE);
        }
      }
      layoutRoot.style.remove();
    }
  };
}

export function updateMilkdownCodeBlockViewportLayout(root: HTMLElement): void {
  const layoutRoot = ensureCodeBlockViewportLayoutRoot(root);
  layoutRoot.style.textContent = "";
  layoutRoot.style.textContent = codeBlockViewportLayoutRules(root, layoutRoot.id, window.innerWidth);
}

export function scheduleMilkdownCodeBlockViewportLayout(
  root: HTMLElement,
  view?: EditorViewWithDomObserverControls
): void {
  requestAnimationFrame(() => {
    if (!root.isConnected || !codeBlockViewportLayoutRoots.has(root)) return;
    view?.domObserver?.stop?.();
    try {
      updateMilkdownCodeBlockViewportLayout(root);
    } finally {
      view?.domObserver?.start?.();
    }
  });
}

export function codeBlockViewportLayoutRules(root: HTMLElement, rootId: string, viewportWidthPx: number): string {
  const shell = editorShellForRoot(root);
  if (shell === null) return "";

  const shellRect = shell.getBoundingClientRect();
  const measuredCodeBlocks: MeasuredCodeBlock[] = [];
  let shellShiftLeftPx = 0;

  for (const codeBlock of root.querySelectorAll<HTMLElement>("pre")) {
    const selector = selectorForCodeBlock(root, rootId, codeBlock);
    if (selector === null) continue;

    const rect = codeBlock.getBoundingClientRect();
    const borderWidthPx = Math.max(0, rect.width - codeBlock.clientWidth);
    const intrinsicWidthPx = codeBlock.scrollWidth + borderWidthPx;
    measuredCodeBlocks.push({
      selector,
      leftPx: rect.left,
      intrinsicWidthPx
    });
    shellShiftLeftPx = Math.max(
      shellShiftLeftPx,
      codeBlockEditorShellShift({
        shellLeftPx: shellRect.left,
        shellRightPx: shellRect.right,
        codeBlockLeftPx: rect.left,
        intrinsicWidthPx,
        viewportWidthPx
      })
    );
  }

  const rules: string[] = [];

  if (shellShiftLeftPx > 0) {
    rules.push(
      `[${CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE}="${rootId}"] { ${EDITOR_SHELL_SHIFT_LEFT_PROPERTY}: ${formatCssPx(shellShiftLeftPx)}; ${EDITOR_SHELL_MARGIN_LEFT_PROPERTY}: ${formatCssPx(-shellShiftLeftPx)}; ${EDITOR_SHELL_MARGIN_RIGHT_PROPERTY}: ${formatCssPx(shellShiftLeftPx)}; }`
    );
  }

  for (const codeBlock of measuredCodeBlocks) {
    const maxWidthPx = codeBlockViewportMaxWidth({
      codeBlockLeftPx: codeBlock.leftPx,
      shellShiftLeftPx,
      viewportWidthPx
    });
    if (shellShiftLeftPx <= 0 && codeBlock.intrinsicWidthPx <= maxWidthPx) continue;

    rules.push(
      `${codeBlock.selector} { ${CODE_BLOCK_MAX_WIDTH_PROPERTY}: ${formatCssPx(maxWidthPx)}; }`
    );
  }
  return rules.join("\n");
}

function ensureCodeBlockViewportLayoutRoot(root: HTMLElement): CodeBlockViewportLayoutRoot {
  const existing = codeBlockViewportLayoutRoots.get(root);
  if (existing !== undefined) {
    ensureCodeBlockViewportLayoutStyleConnected(root, existing.style);
    ensureCodeBlockViewportLayoutShellMarked(root, existing);
    return existing;
  }

  const id = `jot-code-block-layout-${++codeBlockViewportLayoutSequence}`;
  const style = root.ownerDocument.createElement("style");
  style.dataset.jotCodeBlockLayout = id;
  root.setAttribute(CODE_BLOCK_LAYOUT_ROOT_ATTRIBUTE, id);
  ensureCodeBlockViewportLayoutStyleConnected(root, style);

  const layoutRoot: CodeBlockViewportLayoutRoot = { id, style, shiftTargets: [] };
  ensureCodeBlockViewportLayoutShellMarked(root, layoutRoot);
  codeBlockViewportLayoutRoots.set(root, layoutRoot);
  return layoutRoot;
}

function ensureCodeBlockViewportLayoutStyleConnected(root: HTMLElement, style: HTMLStyleElement): void {
  if (style.isConnected) return;
  (root.ownerDocument.head ?? root.ownerDocument.body ?? root).append(style);
}

function ensureCodeBlockViewportLayoutShellMarked(
  root: HTMLElement,
  layoutRoot: CodeBlockViewportLayoutRoot
): void {
  const shiftTargets = codeBlockLayoutShiftTargets(root);
  for (const target of layoutRoot.shiftTargets) {
    if (!shiftTargets.includes(target) && target.getAttribute(CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE) === layoutRoot.id) {
      target.removeAttribute(CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE);
    }
  }
  layoutRoot.shiftTargets = shiftTargets;
  for (const target of shiftTargets) {
    target.setAttribute(CODE_BLOCK_LAYOUT_SHELL_ATTRIBUTE, layoutRoot.id);
  }
}

function editorShellForRoot(root: HTMLElement): HTMLElement | null {
  return root.parentElement;
}

function codeBlockLayoutShiftTargets(root: HTMLElement): readonly HTMLElement[] {
  const targets: HTMLElement[] = [];
  const app = root.closest<HTMLElement>(".app");
  const toolbar = app?.querySelector<HTMLElement>(".app-toolbar") ?? null;
  const shell = editorShellForRoot(root);

  for (const target of [toolbar, shell]) {
    if (target === null || targets.includes(target)) continue;
    targets.push(target);
  }
  return targets;
}

function formatCssPx(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`;
}

function selectorForCodeBlock(root: HTMLElement, rootId: string, codeBlock: HTMLElement): string | null {
  const childIndexes: number[] = [];
  let current: Element = codeBlock;
  while (current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (parent === null) return null;
    const index = Array.prototype.indexOf.call(parent.children, current);
    if (index < 0) return null;
    childIndexes.unshift(index + 1);
    current = parent;
  }

  return `[${CODE_BLOCK_LAYOUT_ROOT_ATTRIBUTE}="${rootId}"]${childIndexes
    .map((index) => ` > :nth-child(${index})`)
    .join("")}`;
}
