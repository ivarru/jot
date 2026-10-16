export type TagIndexMaintenanceStatus = "waiting" | "updating" | "current" | "retrying";

/** One independent worker per page; remote conditional writes arbitrate concurrent clients. */
export function createTagIndexMaintenance(options: {
  maintain: (signal: AbortSignal) => Promise<void>;
  intervalMs: () => number;
  retryMs: () => number;
  onStatus: (status: TagIndexMaintenanceStatus) => void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  const schedule = (delay: number) => {
    if (controller.signal.aborted) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  };
  const run = async () => {
    if (running || controller.signal.aborted) return;
    running = true;
    queued = false;
    options.onStatus("updating");
    let failed = false;
    try {
      await options.maintain(controller.signal);
      if (!controller.signal.aborted) options.onStatus("current");
    } catch {
      failed = true;
      if (!controller.signal.aborted) options.onStatus("retrying");
    } finally {
      running = false;
      schedule(queued ? 250 : Math.max(5000, failed ? options.retryMs() : options.intervalMs()));
    }
  };
  const request = () => {
    if (controller.signal.aborted) return;
    if (running) { queued = true; return; }
    schedule(250);
  };
  options.onStatus("waiting");
  request();
  return {
    request,
    dispose: () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
