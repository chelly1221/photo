import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "kr.threechan.photo",
  appName: "사진",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { backgroundColor: "#111111" },
  plugins: { SplashScreen: { launchShowDuration: 0 } },
};
export default config;
