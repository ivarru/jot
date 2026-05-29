import {
  createMilkdownImageDom,
  createMilkdownImageViewDom,
  imageAttachmentIdFromSrc,
  updateMilkdownImageViewDom
} from "./milkdownImages";

describe("milkdown image rendering", () => {
  it("detects Jot image attachment references", () => {
    expect(imageAttachmentIdFromSrc("jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A")).toBe("01HZY3J2CJX6N7Y25K2K3N8E4A");
    expect(imageAttachmentIdFromSrc("https://example.test/image.jpg")).toBeNull();
  });

  it("renders resolved Jot image references with the display URL", () => {
    const dom = createMilkdownImageDom(
      {
        src: "jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A",
        alt: "Trail"
      },
      {
        "01HZY3J2CJX6N7Y25K2K3N8E4A": {
          id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
          status: "ready",
          url: "https://lh3.googleusercontent.com/p/copy=w1200"
        }
      }
    );

    expect(dom).toBeInstanceOf(HTMLImageElement);
    expect((dom as HTMLImageElement).src).toBe("https://lh3.googleusercontent.com/p/copy=w1200");
    expect((dom as HTMLImageElement).alt).toBe("Trail");
    expect(dom.dataset.jotImageId).toBe("01HZY3J2CJX6N7Y25K2K3N8E4A");
  });

  it("keeps normal markdown images as normal images", () => {
    const dom = createMilkdownImageDom({
      src: "https://example.test/image.jpg",
      alt: "External"
    });

    expect(dom).toBeInstanceOf(HTMLImageElement);
    expect((dom as HTMLImageElement).src).toBe("https://example.test/image.jpg");
    expect((dom as HTMLImageElement).alt).toBe("External");
  });

  it("updates image view DOM in place when a display URL becomes available", () => {
    const wrapper = createMilkdownImageViewDom({
      src: "jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A",
      alt: "Trail"
    });

    expect(wrapper).toBeInstanceOf(HTMLSpanElement);
    expect(wrapper.textContent).toBe("Trail - Loading image preview...");

    updateMilkdownImageViewDom(
      wrapper,
      {
        src: "jot:image:01HZY3J2CJX6N7Y25K2K3N8E4A",
        alt: "Trail"
      },
      {
        "01HZY3J2CJX6N7Y25K2K3N8E4A": {
          id: "01HZY3J2CJX6N7Y25K2K3N8E4A",
          status: "ready",
          url: "https://lh3.googleusercontent.com/p/copy=w1200"
        }
      }
    );

    const image = wrapper.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.src).toBe("https://lh3.googleusercontent.com/p/copy=w1200");
    expect(wrapper).toBeInstanceOf(HTMLSpanElement);
  });
});
