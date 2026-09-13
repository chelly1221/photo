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
void lib.startScan();
const timer = setInterval(() => void lib.startScan(), 5 * 60_000);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    void app.close().then(() => lib.close());
  });
