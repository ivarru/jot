export function firstClipboardImageFile(items: DataTransferItemList | undefined): File | null {
  if (items === undefined) return null;
  for (const item of Array.from(items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file !== null) return file;
  }
  return null;
}
