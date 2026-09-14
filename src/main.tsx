import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { recoverTailscale, suspendTailscale, getTailscaleSnapshot } from "./lib/tailscale";
import { runBackgroundSync } from "./lib/background-runner";
import { backupPhone } from "./lib/backup";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
if (window.BackgroundSyncNative) {
  let pending = false;
  void runBackgroundSync(async () => {
    const settings = JSON.parse(window.PhotoMedia?.configuration?.() ?? '{}');
    return Boolean(settings.enabled && settings.sourceId);
  }, async () => {
    const result = await backupPhone();
    if (!result) return false;
    pending = result.pending;
    return true;
  })
    .then((outcome) => window.BackgroundSyncNative?.complete(outcome === "ok" && pending ? "more" : outcome))
    .catch(() => window.BackgroundSyncNative?.complete("retry"));
} else {
  createRoot(document.getElementById("root")!).render(<App />);
  if (Capacitor.isNativePlatform())
    void NativeApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive && !["NeedsLogin", "NeedsMachineAuth"].includes(getTailscaleSnapshot().state)) suspendTailscale();
      else if (isActive && localStorage.getItem("photo-entered") === "yes")
        void recoverTailscale().catch(() => {});
    });
}
