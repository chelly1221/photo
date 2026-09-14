import { expect, test } from "vitest";
import { authenticationUrl } from "../src/lib/auth-browser";

test("opens official Tailscale device authentication links", () => {
  expect(authenticationUrl("https://login.tailscale.com/a/device-check")).toBe("https://login.tailscale.com/a/device-check");
});

test.each([
  "http://login.tailscale.com/a/test",
  "https://login.tailscale.com.evil.example/a/test",
  "https://user:password@login.tailscale.com/a/test",
  "https://login.tailscale.com:8443/a/test",
  "https://login.tailscale.com/admin",
  "javascript:alert(1)",
])("rejects unexpected authentication destination %s", value => {
  expect(() => authenticationUrl(value)).toThrow();
});
