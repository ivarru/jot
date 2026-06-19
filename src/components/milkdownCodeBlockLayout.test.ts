import {
  createMilkdownCodeBlockViewportLayout,
  codeBlockViewportLayoutRules,
  codeBlockEditorShellShift,
  codeBlockViewportMaxWidth,
  scheduleMilkdownCodeBlockViewportLayout,
  updateMilkdownCodeBlockViewportLayout
} from "./milkdownCodeBlockLayout";

describe("Milkdown code block viewport layout", () => {
  it("keeps the editor shell in place when a code block fits inside it", () => {
    expect(codeBlockEditorShellShift({
      shellLeftPx: 100,
      shellRightPx: 900,
      codeBlockLeftPx: 150,
      intrinsicWidthPx: 700,
      viewportWidthPx: 1000
    })).toBe(0);
  });

  it("moves the editor shell left to center a moderately wide code block", () => {
    expect(codeBlockEditorShellShift({
      shellLeftPx: 100,
      shellRightPx: 900,
      codeBlockLeftPx: 150,
      intrinsicWidthPx: 790,
      viewportWidthPx: 1000
    })).toBe(20);
  });

  it("caps the editor shell shift at the viewport edge", () => {
    expect(codeBlockEditorShellShift({
      shellLeftPx: 100,
      shellRightPx: 900,
      codeBlockLeftPx: 150,
      intrinsicWidthPx: 1400,
      viewportWidthPx: 1000
    })).toBe(100);
  });

  it("caps code block width after the editor shell shift", () => {
    expect(codeBlockViewportMaxWidth({
      codeBlockLeftPx: 150,
      shellShiftLeftPx: 100,
      viewportWidthPx: 1000
    })).toBe(950);
  });

  it("builds scoped stylesheet rules from the widest measured code block", () => {
    const { root } = measuredRootWithCodeBlocks({
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: [
        {
          left: 150,
          renderedWidth: 800,
          clientWidth: 798,
          scrollWidth: 798
        },
        {
          left: 150,
          renderedWidth: 800,
          clientWidth: 798,
          scrollWidth: 838
        }
      ]
    });

    expect(codeBlockViewportLayoutRules(root, "test-root", 1000)).toBe(
      [
        '[data-jot-code-block-layout-shell="test-root"] { --jot-editor-shell-shift-left: 45px; --jot-editor-shell-margin-left: -45px; --jot-editor-shell-margin-right: 45px; }',
        '[data-jot-code-block-layout-root="test-root"] > :nth-child(1) > :nth-child(1) > :nth-child(1) { --jot-code-block-max-width: 895px; }',
        '[data-jot-code-block-layout-root="test-root"] > :nth-child(1) > :nth-child(1) > :nth-child(2) { --jot-code-block-max-width: 895px; }'
      ].join("\n")
    );
  });

  it("recenters after a previously extreme code block is reduced", () => {
    const { root } = measuredRootWithCodeBlocks({
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: [
        {
          left: 150,
          renderedWidth: 800,
          clientWidth: 798,
          scrollWidth: 1098
        }
      ]
    });

    expect(codeBlockViewportLayoutRules(root, "test-root", 1200)).toBe(
      [
        '[data-jot-code-block-layout-shell="test-root"] { --jot-editor-shell-shift-left: 75px; --jot-editor-shell-margin-left: -75px; --jot-editor-shell-margin-right: 75px; }',
        '[data-jot-code-block-layout-root="test-root"] > :nth-child(1) > :nth-child(1) > :nth-child(1) { --jot-code-block-max-width: 1125px; }'
      ].join("\n")
    );
  });

  it("caps extremely wide code blocks at the shifted indentation", () => {
    const { root } = measuredRootWithCodeBlocks({
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: [
        {
          left: 150,
          renderedWidth: 800,
          clientWidth: 798,
          scrollWidth: 1398
        }
      ]
    });

    expect(codeBlockViewportLayoutRules(root, "test-root", 1000)).toBe(
      [
        '[data-jot-code-block-layout-shell="test-root"] { --jot-editor-shell-shift-left: 100px; --jot-editor-shell-margin-left: -100px; --jot-editor-shell-margin-right: 100px; }',
        '[data-jot-code-block-layout-root="test-root"] > :nth-child(1) > :nth-child(1) > :nth-child(1) { --jot-code-block-max-width: 950px; }'
      ].join("\n")
    );
  });

  it("omits stylesheet rules when code blocks fit the editor shell", () => {
    const { root } = measuredRootWithCodeBlocks({
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: [
        {
          left: 150,
          renderedWidth: 700,
          clientWidth: 698,
          scrollWidth: 698
        }
      ]
    });

    expect(codeBlockViewportLayoutRules(root, "test-root", 1440)).toBe("");
  });

  it("reattaches the generated stylesheet when the editor root replacement detaches it", () => {
    const { shell, root } = measuredRootWithCodeBlocks({
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: [
        {
          left: 150,
          renderedWidth: 800,
          clientWidth: 798,
          scrollWidth: 938
        }
      ]
    });
    document.body.append(shell);

    try {
      updateMilkdownCodeBlockViewportLayout(root);
      const style = document.querySelector<HTMLStyleElement>("style[data-jot-code-block-layout]");

      expect(style?.isConnected).toBe(true);
      expect(style?.textContent).toContain("--jot-editor-shell-shift-left");

      style?.remove();
      updateMilkdownCodeBlockViewportLayout(root);

      expect(style?.isConnected).toBe(true);
      expect(style?.textContent).toContain("--jot-editor-shell-shift-left");
    } finally {
      shell.remove();
      document.querySelector<HTMLStyleElement>("style[data-jot-code-block-layout]")?.remove();
    }
  });

  it("marks the toolbar and editor shell as shared shift targets", () => {
    const { shell, toolbar, root } = measuredRootWithCodeBlocks({
      includeToolbar: true,
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: []
    });
    document.body.append(shell.parentElement!);

    try {
      updateMilkdownCodeBlockViewportLayout(root);
      const rootId = root.getAttribute("data-jot-code-block-layout-root");

      expect(toolbar.getAttribute("data-jot-code-block-layout-shell")).toBe(rootId);
      expect(shell.getAttribute("data-jot-code-block-layout-shell")).toBe(rootId);
    } finally {
      shell.parentElement?.remove();
      document.querySelector<HTMLStyleElement>("style[data-jot-code-block-layout]")?.remove();
    }
  });

  it("does not recreate layout styles when a standalone scheduled update runs after cleanup", () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextFrameId++;
      animationFrames.set(id, callback);
      return id;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      animationFrames.delete(id);
    });
    const { shell, root } = measuredRootWithCodeBlocks({
      shell: {
        left: 100,
        width: 800
      },
      codeBlocks: [
        {
          left: 150,
          renderedWidth: 800,
          clientWidth: 798,
          scrollWidth: 938
        }
      ]
    });
    document.body.append(shell.parentElement!);

    try {
      const cleanup = createMilkdownCodeBlockViewportLayout(root);
      scheduleMilkdownCodeBlockViewportLayout(root);
      cleanup();

      for (const callback of animationFrames.values()) {
        callback(0);
      }

      expect(root.getAttribute("data-jot-code-block-layout-root")).toBeNull();
      expect(shell.getAttribute("data-jot-code-block-layout-shell")).toBeNull();
      expect(document.querySelector("style[data-jot-code-block-layout]")).toBeNull();
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
      shell.parentElement?.remove();
      document.querySelector<HTMLStyleElement>("style[data-jot-code-block-layout]")?.remove();
    }
  });
});

function measuredRootWithCodeBlocks(input: {
  readonly includeToolbar?: boolean;
  readonly shell: {
    readonly left: number;
    readonly width: number;
  };
  readonly codeBlocks: readonly {
    readonly left: number;
    readonly renderedWidth: number;
    readonly clientWidth: number;
    readonly scrollWidth: number;
  }[];
}): {
  readonly shell: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly root: HTMLElement;
  readonly codeBlocks: readonly HTMLElement[];
} {
  const app = document.createElement("div");
  app.className = "app";
  const toolbar = document.createElement("header");
  toolbar.className = "app-toolbar";
  const shell = document.createElement("div");
  shell.className = "editor-shell";
  const root = document.createElement("div");
  const milkdown = document.createElement("div");
  const editor = document.createElement("div");
  const codeBlocks = input.codeBlocks.map((codeBlock) => measuredCodeBlock(codeBlock));
  shell.getBoundingClientRect = () => ({
    x: input.shell.left,
    y: 0,
    width: input.shell.width,
    height: 0,
    top: 0,
    right: input.shell.left + input.shell.width,
    bottom: 0,
    left: input.shell.left,
    toJSON: () => ({})
  });
  if (input.includeToolbar === true) app.append(toolbar);
  app.append(shell);
  shell.append(root);
  root.append(milkdown);
  milkdown.append(editor);
  editor.append(...codeBlocks);
  return { shell, toolbar, root, codeBlocks };
}

function measuredCodeBlock(input: {
  readonly left: number;
  readonly renderedWidth: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
}): HTMLElement {
  const codeBlock = document.createElement("pre");
  codeBlock.getBoundingClientRect = () => ({
    x: input.left,
    y: 0,
    width: input.renderedWidth,
    height: 0,
    top: 0,
    right: input.left + input.renderedWidth,
    bottom: 0,
    left: input.left,
    toJSON: () => ({})
  });
  Object.defineProperty(codeBlock, "clientWidth", { value: input.clientWidth });
  Object.defineProperty(codeBlock, "scrollWidth", { value: input.scrollWidth });
  return codeBlock;
}
