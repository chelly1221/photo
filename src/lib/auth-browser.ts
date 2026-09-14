import { registerPlugin } from "@capacitor/core";

export const AuthBrowser = registerPlugin<{
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
}>("AuthBrowser");

export function authenticationUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "login.tailscale.com" ||
      (url.port && url.port !== "443") || url.username || url.password || !url.pathname.startsWith("/a/")) {
    throw new Error("인증 주소를 확인하지 못했어요. 다시 연결해 주세요.");
  }
  return url.href;
}
