import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";

const JOT_IMAGE_SRC_PATTERN = /^jot:image:([0-9A-HJKMNP-TV-Z]{26})$/;

export type ImageAttachmentDisplayMap = Readonly<Record<string, ImageAttachmentDisplay>>;

export function imageAttachmentIdFromSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  return JOT_IMAGE_SRC_PATTERN.exec(src)?.[1] ?? null;
}

export function createMilkdownImageDom(
  attrs: {
    readonly src?: unknown;
    readonly alt?: unknown;
    readonly title?: unknown;
  },
  displays: ImageAttachmentDisplayMap = {}
): HTMLElement {
  const src = stringAttr(attrs.src);
  const alt = stringAttr(attrs.alt);
  const title = stringAttr(attrs.title);
  const attachmentId = imageAttachmentIdFromSrc(src);

  if (attachmentId === null) {
    return createImg({ src, alt, title });
  }

  const display = displays[attachmentId];
  if (display?.status === "ready") {
    const image = createImg({ src: display.url, alt, title });
    image.dataset.jotImageId = attachmentId;
    image.addEventListener("error", () => {
      image.replaceWith(createPlaceholder(attachmentId, alt, "Could not load image preview."));
    });
    return image;
  }

  return createPlaceholder(
    attachmentId,
    alt,
    display?.status === "missing" || display?.status === "error" ? display.message : "Loading image preview..."
  );
}

export function createMilkdownImageViewDom(
  attrs: {
    readonly src?: unknown;
    readonly alt?: unknown;
    readonly title?: unknown;
  },
  displays: ImageAttachmentDisplayMap = {}
): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "jot-image-view";
  wrapper.contentEditable = "false";
  updateMilkdownImageViewDom(wrapper, attrs, displays);
  return wrapper;
}

export function updateMilkdownImageViewDom(
  wrapper: HTMLElement,
  attrs: {
    readonly src?: unknown;
    readonly alt?: unknown;
    readonly title?: unknown;
  },
  displays: ImageAttachmentDisplayMap = {}
): void {
  wrapper.replaceChildren(createMilkdownImageDom(attrs, displays));
}

function createImg(input: { readonly src: string; readonly alt: string; readonly title: string }): HTMLImageElement {
  const image = document.createElement("img");
  image.src = input.src;
  image.alt = input.alt;
  if (input.title) image.title = input.title;
  image.draggable = true;
  image.contentEditable = "false";
  return image;
}

function createPlaceholder(id: string, alt: string, message: string): HTMLElement {
  const placeholder = document.createElement("span");
  placeholder.className = "jot-image-placeholder";
  placeholder.contentEditable = "false";
  placeholder.dataset.jotImageId = id;
  placeholder.textContent = alt ? `${alt} - ${message}` : message;
  return placeholder;
}

function stringAttr(value: unknown): string {
  return typeof value === "string" ? value : "";
}
