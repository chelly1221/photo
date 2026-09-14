import fs from "node:fs/promises";
import { Library } from "./library";
import { createApp } from "./app";
import { NasService, runNasHelper } from './nas';
const stateDir = process.env.STATE_DIR ?? "state";
await fs.mkdir(stateDir, { recursive: true });
const lib = new Library({
  stateDir,
  mountRoot: process.env.MOUNT_ROOT ?? "/mnt/photo",
  mountHelper: process.env.MOUNT_HELPER,
});
const app = createApp(
  lib,
  (process.env.TAILSCALE_ALLOWED_LOGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  new NasService(runNasHelper(process.env.NAS_HELPER??'/usr/local/sbin/photo-nas')),
);
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 8793) });
let lastErrorRetry = 0;
const scan = () => {
  if (lib.scanning) return;
  const retryErrors = Date.now() - lastErrorRetry >= 60 * 60_000;
  if (retryErrors) lastErrorRetry = Date.now();
  void lib.startScan(retryErrors).catch(() => {
    // Keep the server alive and retry on the next scheduled pass.
    console.error("Photo scan interrupted; it will retry automatically.");
  });
};
scan();
const timer = setInterval(scan, 5 * 60_000);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    void app.close().then(() => lib.close());
  });
