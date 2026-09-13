import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { ensureTailscale, suspendTailscale, getTailscaleSnapshot } from "./lib/tailscale";
import { backupPhone } from "./lib/backup";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
if (window.BackgroundSyncNative) {
  void ensureTailscale()
    .then(() => backupPhone())
    .then((result) => window.BackgroundSyncNative?.complete(result?.pending ? "more" : "ok"))
    .catch(() => window.BackgroundSyncNative?.complete("retry"));
} else {
  createRoot(document.getElementById("root")!).render(<App />);
  if (Capacitor.isNativePlatform())
    void NativeApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive && getTailscaleSnapshot().state !== "NeedsLogin") suspendTailscale();
      else if (isActive && localStorage.getItem("photo-entered") === "yes")
        void ensureTailscale().catch(() => {});
    });
}
