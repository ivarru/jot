import createDOMPurify from "dompurify";
import katex from "katex";
import type { KatexOptions } from "katex";
import remarkMath from "remark-math";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";

interface MathMarkdownNode {
  readonly type: string;
  readonly value?: string;
}

interface MarkdownNodeWithChildren extends MathMarkdownNode {
  children?: MarkdownNodeWithChildren[] | undefined;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  } | undefined;
}

const mathValueAttr = {
  value: {
    default: "",
    validate: "string"
  }
};

type KatexMacros = NonNullable<KatexOptions["macros"]>;

interface MathRenderRegistration {
  readonly displayMode: boolean;
  readonly dom: HTMLElement;
  readonly getNode: () => ProseNode;
  readonly getPos: () => number | undefined;
  readonly sequence: number;
}

interface MathRenderScope {
  readonly register: (registration: MathRenderRegistration) => () => void;
  readonly renderAll: () => void;
}

let purifier: ReturnType<typeof createDOMPurify> | null = null;

export const remarkMathPlugin = $remark("remarkMath", () => remarkMath, { singleDollarTextMath: false });
export const remarkStandaloneDisplayMathPlugin = $remark("remarkStandaloneDisplayMath", () => () =>
  (tree: unknown) => {
    rewriteStandaloneDisplayMath(tree as MarkdownNodeWithChildren);
  }
);

export const inlineMathSchema = $nodeSchema("inlineMath", () => ({
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: mathValueAttr,
  parseDOM: [{
    tag: "span[data-type=\"math-inline\"]",
    getAttrs: (dom) => ({
      value: dom instanceof HTMLElement ? dom.dataset.value ?? "" : ""
    })
  }],
  toDOM: (node) => ["span", {
    "data-type": "math-inline",
    "data-value": String(node.attrs.value)
  }, String(node.attrs.value)],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.addNode(type, { value: mathMarkdownValue(node) });
    }
  },
  leafText: (node) => `$$${String(node.attrs.value)}$$`,
  toMarkdown: {
    match: (node) => node.type.name === "inlineMath",
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, String(node.attrs.value));
    }
  }
}));

export const mathBlockSchema = $nodeSchema("math", () => ({
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,
  attrs: mathValueAttr,
  parseDOM: [{
    tag: "div[data-type=\"math-block\"]",
    getAttrs: (dom) => ({
      value: dom instanceof HTMLElement ? dom.dataset.value ?? "" : ""
    })
  }],
  toDOM: (node) => ["div", {
    "data-type": "math-block",
    "data-value": String(node.attrs.value)
  }, String(node.attrs.value)],
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.addNode(type, { value: mathMarkdownValue(node) });
    }
  },
  leafText: (node) => `$$\n${String(node.attrs.value)}\n$$`,
  toMarkdown: {
    match: (node) => node.type.name === "math",
    runner: (state, node) => {
      state.addNode("math", undefined, String(node.attrs.value));
    }
  }
}));

export function createLatexPlugins() {
  const renderScope = createMathRenderScope();
  const inlineMathView = $view(inlineMathSchema.node, () => createMathNodeView(false, renderScope));
  const mathBlockView = $view(mathBlockSchema.node, () => createMathNodeView(true, renderScope));

  return [
    remarkMathPlugin,
    remarkStandaloneDisplayMathPlugin,
    inlineMathSchema,
    mathBlockSchema,
    inlineMathView,
    mathBlockView
  ].flat();
}

function mathMarkdownValue(node: MathMarkdownNode): string {
  return node.value ?? "";
}

function rewriteStandaloneDisplayMath(node: MarkdownNodeWithChildren): void {
  const children = node.children;
  if (children === undefined) return;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined) continue;
    if (isStandaloneDoubleDollarParagraph(child)) {
      const mathNode: MarkdownNodeWithChildren = {
        type: "math",
        value: child.children?.[0]?.value ?? ""
      };
      if (child.position !== undefined) {
        mathNode.position = child.position;
      }
      children[index] = {
        ...mathNode
      };
      continue;
    }
    rewriteStandaloneDisplayMath(child);
  }
}

function isStandaloneDoubleDollarParagraph(node: MarkdownNodeWithChildren): boolean {
  if (node.type !== "paragraph" || node.children?.length !== 1) return false;

  const child = node.children[0];
  if (child?.type !== "inlineMath") return false;

  const start = child.position?.start?.offset;
  const end = child.position?.end?.offset;
  if (start === undefined || end === undefined) return false;

  return end - start >= mathMarkdownValue(child).length + 4;
}

function createMathNodeView(displayMode: boolean, renderScope: MathRenderScope): NodeViewConstructor {
  return (node: ProseNode, _view, getPos): NodeView => {
    let currentNode = node;
    const dom = createMathDom(currentNode, displayMode);
    const unregister = renderScope.register({
      displayMode,
      dom,
      getNode: () => currentNode,
      getPos,
      sequence: nextMathRenderSequence()
    });

    return {
      dom,
      update: (nextNode: ProseNode) => {
        if (nextNode.type !== currentNode.type) return false;
        currentNode = nextNode;
        renderScope.renderAll();
        return true;
      },
      destroy: unregister,
      ignoreMutation: () => true
    };
  };
}

function createMathDom(node: ProseNode, displayMode: boolean): HTMLElement {
  const dom = document.createElement(displayMode ? "div" : "span");
  dom.className = displayMode ? "milkdown-math-block" : "milkdown-math-inline";
  dom.dataset.type = displayMode ? "math-block" : "math-inline";
  dom.setAttribute("contenteditable", "false");
  renderMath(dom, String(node.attrs.value), displayMode, {});
  return dom;
}

let mathRenderSequence = 0;

function nextMathRenderSequence(): number {
  mathRenderSequence += 1;
  return mathRenderSequence;
}

function createMathRenderScope(): MathRenderScope {
  const registrations = new Set<MathRenderRegistration>();

  const renderAll = () => {
    const macros: KatexMacros = {};
    for (const registration of [...registrations].sort(compareMathRenderRegistrations)) {
      renderMath(
        registration.dom,
        String(registration.getNode().attrs.value),
        registration.displayMode,
        macros
      );
    }
  };

  return {
    register: (registration) => {
      registrations.add(registration);
      renderAll();
      return () => {
        registrations.delete(registration);
        renderAll();
      };
    },
    renderAll
  };
}

function compareMathRenderRegistrations(left: MathRenderRegistration, right: MathRenderRegistration): number {
  return mathRenderPosition(left) - mathRenderPosition(right) || left.sequence - right.sequence;
}

function mathRenderPosition(registration: MathRenderRegistration): number {
  try {
    return registration.getPos() ?? Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function renderMath(dom: HTMLElement, value: string, displayMode: boolean, macros: KatexMacros): void {
  dom.dataset.value = value;
  dom.classList.toggle("is-empty", value.trim() === "");
  dom.classList.remove("has-error");

  if (value.trim() === "") {
    dom.textContent = displayMode ? "$$ $$" : "$$ $$";
    return;
  }

  try {
    const html = katex.renderToString(value, {
      displayMode,
      macros,
      throwOnError: false,
      strict: "warn",
      trust: false
    });
    dom.innerHTML = sanitizeHtml(html);
  } catch {
    dom.classList.add("has-error");
    dom.textContent = displayMode ? `$$ ${value} $$` : `$$${value}$$`;
  }
}

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html;
  purifier ??= createDOMPurify(window);
  return purifier.sanitize(html, { USE_PROFILES: { html: true } });
}
