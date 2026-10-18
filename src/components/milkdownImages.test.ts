import {
  createMilkdownImageDom,
  createMilkdownImageClipboardDom,
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

  it("requires permission before constructing an external image", () => {
    const dom = createMilkdownImageDom({
      src: "https://example.test/image.jpg",
      alt: "External"
    });

    expect(dom.querySelector("img")).toBeNull();
    document.body.append(dom);
    dom.querySelector("button")!.click();
    expect(dom.querySelector("img")?.src).toBe("https://example.test/image.jpg");
    expect(dom.querySelector("img")?.referrerPolicy).toBe("no-referrer");
    dom.remove();
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


it("keeps permission within the same image view and resets it on a changed source", () => {
  const wrapper = createMilkdownImageViewDom({ src: "https://example.test/a.png" });
  document.body.append(wrapper);
  wrapper.querySelector("button")!.click();
  updateMilkdownImageViewDom(wrapper, { src: "https://example.test/a.png" });
  expect(wrapper.querySelector("img")).not.toBeNull();
  updateMilkdownImageViewDom(wrapper, { src: "https://example.test/b.png" });
  expect(wrapper.querySelector("img")).toBeNull();
  const oldButton = wrapper.querySelector("button")!;
  updateMilkdownImageViewDom(wrapper, { src: "https://example.test/c.png" });
  oldButton.click();
  expect(wrapper.querySelector("img")).toBeNull();
  wrapper.remove();
});

it("serializes image source as inert clipboard metadata, not a live image", () => {
  const dom = createMilkdownImageClipboardDom({ src: "https://example.test/image.png", alt: "<private>", title: "Title" });
  expect(dom.tagName).toBe("SPAN");
  expect(dom.querySelector("img")).toBeNull();
  expect(dom.dataset.jotImageSrc).toBe("https://example.test/image.png");
  expect(dom.textContent).toBe("<private>");
});


it.each(["javascript:alert(1)", "data:text/html,private", "ftp://example.test/image", "https://user:password@example.test/image"])("does not offer to load unsupported image URL %s", src => {
  const dom = createMilkdownImageDom({ src });
  expect(dom.querySelector("img, button")).toBeNull();
  expect(dom.textContent).toContain("Unsupported image address");
});
