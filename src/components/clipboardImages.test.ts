import { firstClipboardImageFile } from "./clipboardImages";

describe("clipboard images", () => {
  it("finds the first image file in clipboard items", () => {
    const image = new File(["image"], "pasted.png", { type: "image/png" });
    const items = [
      item("string", "text/plain", null),
      item("file", "image/png", image)
    ] as unknown as DataTransferItemList;

    expect(firstClipboardImageFile(items)).toBe(image);
  });

  it("ignores non-image clipboard files", () => {
    const items = [
      item("file", "text/plain", new File(["note"], "note.txt", { type: "text/plain" }))
    ] as unknown as DataTransferItemList;

    expect(firstClipboardImageFile(items)).toBeNull();
  });
});

function item(kind: string, type: string, file: File | null): DataTransferItem {
  return {
    kind,
    type,
    getAsFile: () => file
  } as DataTransferItem;
}
