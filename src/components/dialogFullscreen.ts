/** Escape belongs to a modal while it is open, when the browser supports keyboard lock. */
export function preserveDialogFullscreen(): () => void {
  const keyboard = (navigator as Navigator & {
    keyboard?: { lock(keys: string[]): Promise<void>; unlock(): void }
  }).keyboard;
  let active = true;
  let locked = false;
  const update = async () => {
    if (!keyboard) return;
    if (!document.fullscreenElement) {
      if (locked) keyboard.unlock();
      locked = false;
      return;
    }
    try {
      await keyboard.lock(["Escape"]);
      if (!active || !document.fullscreenElement) keyboard.unlock();
      else locked = true;
    } catch {
      // Native browser fullscreen rules apply if keyboard capture is unavailable or denied.
    }
  };
  document.addEventListener("fullscreenchange", update);
  void update();
  return () => {
    active = false;
    document.removeEventListener("fullscreenchange", update);
    if (locked) keyboard?.unlock();
  };
}
