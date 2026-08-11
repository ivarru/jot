const VISUAL_VIEWPORT_TOP_PROPERTY = "--jot-visual-viewport-top";

type VisualViewportTopSource = Pick<VisualViewport, "offsetTop" | "addEventListener" | "removeEventListener">;

export function trackVisualViewportTop(root: HTMLElement, viewport: VisualViewportTopSource): () => void {
  const update = () => {
    const offsetTop = Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
    root.style.setProperty(VISUAL_VIEWPORT_TOP_PROPERTY, `${offsetTop}px`);
  };

  viewport.addEventListener("scroll", update);
  viewport.addEventListener("resize", update);
  update();

  return () => {
    viewport.removeEventListener("scroll", update);
    viewport.removeEventListener("resize", update);
    root.style.removeProperty(VISUAL_VIEWPORT_TOP_PROPERTY);
  };
}
