import { describe, it, expect, vi } from "vitest";
import { NasService, nasAddress, nasPath } from "../server/nas";

describe("NAS discovery and connection boundaries", () => {
  it("only accepts explicit NAS addresses and prevents path traversal", () => {
    for (const host of ["100.75.89.101", "192.168.0.10", "10.0.0.4"])
      expect(nasAddress.safeParse(host).success).toBe(true);
    for (const host of [
      "127.0.0.1",
      "169.254.169.254",
      "8.8.8.8",
      "localhost",
      "192.168.0.1;id",
      "100.075.1.1",
    ])
      expect(nasAddress.safeParse(host).success).toBe(false);
    for (const path of ["../etc", "Photos/../../etc", "/etc", "Photos\\secret", "Photos\nsecret"])
      expect(nasPath.safeParse(path).success).toBe(false);
    expect(nasPath.parse("가족 사진/여행 2026")).toBe("가족 사진/여행 2026");
  });
  it("binds discovered endpoints and SSH keys to the account without disclosing raw keys", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        options: [
          {
            id: "sftp-22",
            protocol: "sftp",
            port: 22,
            available: true,
            keys: "pinned key",
            fingerprint: "SHA256:test",
          },
        ],
      })
      .mockResolvedValueOnce({ connectionId: "connected" });
    const nas = new NasService(run);
    const scan = await nas.discover("alice", "100.75.89.101");
    expect(scan.options[0]).not.toHaveProperty("keys");
    const credentials = {
      scanId: scan.scanId,
      optionId: "sftp-22",
      username: "nas-user",
      password: "not-logged",
    };
    await expect(nas.connect("bob", credentials)).rejects.toThrow("만료");
    await expect(nas.connect("alice", { ...credentials, optionId: "webdav-80" })).rejects.toThrow(
      "선택",
    );
    expect(run).toHaveBeenCalledTimes(1);
    await nas.connect("alice", credentials);
    expect(run.mock.calls[1][0]).toMatchObject({
      host: "100.75.89.101",
      option: { keys: "pinned key" },
      password: "not-logged",
    });
  });
  it("does not send credentials during discovery and does not allow concurrent scans", async () => {
    let finish!: (value: unknown) => void;
    const run = vi.fn(
      (_input: Record<string, unknown>) =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const nas = new NasService(run);
    const first = nas.discover("alice", "10.0.0.1");
    await expect(nas.discover("alice", "10.0.0.1")).rejects.toThrow();
    expect(run.mock.calls[0][0]).toEqual({ action: "discover", host: "10.0.0.1" });
    finish({ options: [] });
    await first;
  });
});
