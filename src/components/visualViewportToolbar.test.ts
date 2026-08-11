import { trackVisualViewportTop } from "./visualViewportToolbar";

describe("visual viewport toolbar tracking", () => {
  it("keeps the sticky toolbar at the visible top while a zoomed viewport is panned", () => {
    const viewport = new FakeVisualViewport();
    const root = document.createElement("div");
    const stop = trackVisualViewportTop(root, viewport);

    expect(root.style.getPropertyValue("--jot-visual-viewport-top")).toBe("0px");

    viewport.offsetTop = 17.5;
    viewport.dispatchEvent(new Event("scroll"));

    expect(root.style.getPropertyValue("--jot-visual-viewport-top")).toBe("17.5px");

    stop();
    expect(root.style.getPropertyValue("--jot-visual-viewport-top")).toBe("");
  });

  it("updates when pinch zoom changes the visual viewport size", () => {
    const viewport = new FakeVisualViewport();
    const root = document.createElement("div");
    const stop = trackVisualViewportTop(root, viewport);

    viewport.offsetTop = 9;
    viewport.dispatchEvent(new Event("resize"));

    expect(root.style.getPropertyValue("--jot-visual-viewport-top")).toBe("9px");
    stop();
  });
});

class FakeVisualViewport extends EventTarget {
  offsetTop = 0;
}
