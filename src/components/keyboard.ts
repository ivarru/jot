export function isEscapeKey(event: KeyboardEvent): boolean {
  return event.key === "Escape" || event.key === "Esc" || event.key === "ESC" || event.code === "Escape";
}
