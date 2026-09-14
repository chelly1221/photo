import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

test("cancelled connection wait ends promptly and a later retry can succeed", async () => {
  let worker!: { onmessage?: (event: { data: unknown }) => void };
  vi.stubGlobal("SharedWorker", undefined);
  vi.stubGlobal("window", { addEventListener: vi.fn() });
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    constructor() { worker = this; }
    postMessage() {}
  });
  const { ensureTailscale, getTailscaleSnapshot } = await import("../src/lib/tailscale");
  const cancelled = new AbortController();
  const first = ensureTailscale(cancelled.signal);
  cancelled.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });

  const retry = ensureTailscale(new AbortController().signal);
  worker.onmessage?.({ data: { type: "state", value: { state: "Running", message: "연결됨", loginUrl: "" } } });
  await expect(retry).resolves.toBeUndefined();
  expect(getTailscaleSnapshot().state).toBe("Running");
});

test("an already cancelled attempt never starts a worker", async () => {
  const worker = vi.fn();
  vi.stubGlobal("Worker", worker);
  const { ensureTailscale } = await import("../src/lib/tailscale");
  await expect(ensureTailscale(AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
  expect(worker).not.toHaveBeenCalled();
});
