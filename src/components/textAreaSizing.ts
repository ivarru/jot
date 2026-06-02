export function resizeTextAreaToContents(element: HTMLTextAreaElement): void {
  const currentHeight = numericPixelValue(element.style.height);
  if (currentHeight !== null && element.scrollHeight > currentHeight) {
    element.style.height = `${element.scrollHeight}px`;
    return;
  }

  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function numericPixelValue(value: string): number | null {
  if (!value.endsWith("px")) return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
