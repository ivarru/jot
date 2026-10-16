import { createTagIndexMaintenance } from "./maintenance";

afterEach(() => { vi.useRealTimers(); });

it("retries offline work and rebuilds periodically without an editor change", async () => {
  vi.useFakeTimers();
  const maintain = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const status = vi.fn();
  const worker = createTagIndexMaintenance({ maintain, intervalMs: () => 10000, retryMs: () => 5000, onStatus: status });
  await vi.advanceTimersByTimeAsync(250);
  expect(status).toHaveBeenLastCalledWith("retrying");
  await vi.advanceTimersByTimeAsync(5000);
  expect(status).toHaveBeenLastCalledWith("current");
  await vi.advanceTimersByTimeAsync(10000);
  expect(maintain).toHaveBeenCalledTimes(3);
  worker.dispose();
  await vi.advanceTimersByTimeAsync(100000);
  expect(maintain).toHaveBeenCalledTimes(3);
});

it("coalesces changes during pending work, keeps a single worker, and aborts on disposal", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const maintain = vi.fn((signal: AbortSignal) => new Promise<void>((resolve) => { release = resolve; }));
  const status = vi.fn();
  const worker = createTagIndexMaintenance({ maintain, intervalMs: () => 10000, retryMs: () => 5000, onStatus: status });
  await vi.advanceTimersByTimeAsync(250);
  worker.request(); worker.request();
  await vi.advanceTimersByTimeAsync(1000);
  expect(maintain).toHaveBeenCalledOnce();
  release();
  await vi.advanceTimersByTimeAsync(250);
  expect(maintain).toHaveBeenCalledTimes(2);
  worker.dispose();
  expect(maintain.mock.calls[1]![0].aborted).toBe(true);
  const count = status.mock.calls.length;
  release(); await Promise.resolve();
  expect(status.mock.calls).toHaveLength(count);
});
