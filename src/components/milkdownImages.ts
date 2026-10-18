import type { ImageAttachmentDisplay } from "~/domain/imageAttachmentDisplay";

const JOT_IMAGE_SRC_PATTERN = /^jot:image:([0-9A-HJKMNP-TV-Z]{26})$/;

const allowedImageUrls = new WeakMap<HTMLElement, string>();
const imageViewRenders = new WeakMap<HTMLElement, { src: string; alt: string; title: string; display: ImageAttachmentDisplay | undefined; allowedSrc: string | undefined }>();

export function revokeMilkdownExternalImagePermission(wrapper: HTMLElement): void {
  allowedImageUrls.delete(wrapper);
}

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
  displays: ImageAttachmentDisplayMap = {},
  external: { readonly allowedSrc?: string; readonly onAllow?: (src: string) => void } = {}
): HTMLElement {
  const src = stringAttr(attrs.src);
  const alt = stringAttr(attrs.alt);
  const title = stringAttr(attrs.title);
  const attachmentId = imageAttachmentIdFromSrc(src);

  if (attachmentId === null) {
    if (/^data:image\//i.test(src) || (src.startsWith("blob:") && safeImageUrl(src)?.origin === window.location.origin)) {
      return createImg({ src, alt, title });
    }
    const url = safeImageUrl(src);
    if (url === null || !["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      const placeholder = document.createElement("span");
      placeholder.className = "jot-image-placeholder";
      placeholder.textContent = alt ? `${alt} — Unsupported image address.` : "Unsupported image address.";
      return placeholder;
    }
    if (external.allowedSrc === src) return createImg({ src, alt, title });
    const placeholder = document.createElement("span");
    placeholder.className = "jot-image-placeholder jot-external-image";
    placeholder.contentEditable = "false";
    const label = document.createElement("span");
    label.textContent = `${alt ? `${alt} — ` : ""}Loading contacts ${url.host}.`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Load image";
    button.setAttribute("aria-label", `Load external image from ${url.host}`);
    button.addEventListener("mousedown", event => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!placeholder.isConnected) return;
      if (external.onAllow) external.onAllow(src);
      else placeholder.replaceChildren(createImg({ src, alt, title }));
    });
    placeholder.append(label, button);
    return placeholder;
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
  const src = stringAttr(attrs.src);
  if (allowedImageUrls.get(wrapper) !== src) allowedImageUrls.delete(wrapper);
  const allowedSrc = allowedImageUrls.get(wrapper);
  const alt = stringAttr(attrs.alt);
  const title = stringAttr(attrs.title);
  const attachmentId = imageAttachmentIdFromSrc(src);
  const display = attachmentId === null ? undefined : displays[attachmentId];
  const previous = imageViewRenders.get(wrapper);
  if (previous && previous.src === src && previous.alt === alt && previous.title === title &&
    previous.display === display && previous.allowedSrc === allowedSrc) return;
  imageViewRenders.set(wrapper, { src, alt, title, display, allowedSrc });
  wrapper.replaceChildren(createMilkdownImageDom(attrs, displays, {
    ...(allowedSrc === undefined ? {} : { allowedSrc }),
    onAllow: url => {
      if (!wrapper.isConnected) return;
      allowedImageUrls.set(wrapper, url);
      updateMilkdownImageViewDom(wrapper, attrs, displays);
    }
  }));
}

function createImg(input: { readonly src: string; readonly alt: string; readonly title: string }): HTMLImageElement {
  const image = document.createElement("img");
  image.referrerPolicy = "no-referrer";
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

// Clipboard/plain-Markdown paste serialization must never construct a live img
// before the node view has asked for permission. Preserve all source attributes.
export function createMilkdownImageClipboardDom(attrs: { readonly src?: unknown; readonly alt?: unknown; readonly title?: unknown }): HTMLElement {
  const span = document.createElement("span");
  span.dataset.jotImageSrc = stringAttr(attrs.src);
  span.dataset.jotImageAlt = stringAttr(attrs.alt);
  span.dataset.jotImageTitle = stringAttr(attrs.title);
  span.textContent = stringAttr(attrs.alt) || "Image";
  return span;
}

function safeImageUrl(src: string): URL | null {
  if (!src.trim()) return null;
  try { return new URL(src, window.location.href); } catch { return null; }
}
