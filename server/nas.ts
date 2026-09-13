import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const nasAddress = z
  .string()
  .trim()
  .max(64)
  .refine((value) => {
    const parts = value.split(".");
    if (
      parts.length !== 4 ||
      parts.some((p) => !/^\d{1,3}$/.test(p) || String(Number(p)) !== p || Number(p) > 255)
    )
      return false;
    const [a, b] = parts.map(Number);
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }, "사설 네트워크 또는 Tailscale의 NAS IPv4 주소를 입력해 주세요.");
export const nasPath = z
  .string()
  .max(1500)
  .refine(
    (value) =>
      !/[\\\0\r\n]/.test(value) &&
      !value.startsWith("/") &&
      !value.split("/").some((p) => p === ".." || p === "."),
    "폴더 경로를 확인해 주세요.",
  );
export type NasOption = {
  id: string;
  protocol: "smb" | "sftp" | "webdav";
  port: number;
  label: string;
  detail: string;
  available: boolean;
  secure: boolean;
  fingerprint?: string;
  keys?: string;
  scheme?: string;
};
export type NasListing = {
  path: string;
  folders: { name: string; path: string }[];
  next: number | null;
};
type Run = (input: Record<string, unknown>) => Promise<any>;
export function runNasHelper(helper: string): Run {
  return (input) =>
    new Promise((resolve, reject) => {
      const child = spawn("sudo", ["-n", helper], { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      let settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(
            new Error("NAS 응답을 확인할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요."),
          );
        }
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        fail();
      }, 45_000);
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.length > 4 * 1024 * 1024) {
          child.kill("SIGKILL");
          fail();
        }
      });
      // Never forward subprocess stderr: remote errors can contain credentials or private paths.
      child.stderr.on("data", () => {});
      child.on("error", () => {
        clearTimeout(timer);
        fail();
      });
      child.on("close", () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        try {
          const result = JSON.parse(output);
          if (result.error) reject(new Error(result.error));
          else resolve(result);
        } catch {
          reject(new Error("NAS 연결 도우미를 확인해 주세요."));
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(input));
    });
}
export class NasService {
  private scans = new Map<
    string,
    { owner: string; host: string; options: NasOption[]; expires: number }
  >();
  private active = new Set<string>();
  private lastScan = new Map<string, number>();
  constructor(private run: Run) {}
  private async exclusive<T>(owner: string, work: () => Promise<T>) {
    if (this.active.has(owner))
      throw new Error("진행 중인 NAS 연결 작업이 끝난 뒤 다시 시도해 주세요.");
    this.active.add(owner);
    try {
      return await work();
    } finally {
      this.active.delete(owner);
    }
  }
  async discover(owner: string, host: string) {
    nasAddress.parse(host);
    if (Date.now() - (this.lastScan.get(owner) ?? 0) < 3000)
      throw new Error("잠시 후 다시 검색해 주세요.");
    this.lastScan.set(owner, Date.now());
    return this.exclusive(owner, async () => {
      for (const [id, s] of this.scans)
        if (s.expires < Date.now() || s.owner === owner) this.scans.delete(id);
      const { options } = await this.run({ action: "discover", host });
      const scanId = randomUUID();
      this.scans.set(scanId, { owner, host, options, expires: Date.now() + 600_000 });
      return { scanId, host, options: options.map(({ keys, ...visible }: NasOption) => visible) };
    });
  }
  async connect(
    owner: string,
    input: { scanId: string; optionId: string; username: string; password: string },
  ) {
    const scan = this.scans.get(input.scanId);
    if (!scan || scan.owner !== owner || scan.expires < Date.now())
      throw new Error("검색 결과가 만료됐어요. NAS를 다시 찾아 주세요.");
    const option = scan.options.find((o) => o.id === input.optionId && o.available);
    if (!option) throw new Error("발견된 연결 방식 중 하나를 선택해 주세요.");
    return this.exclusive(owner, () =>
      this.run({
        action: "connect",
        owner,
        host: scan.host,
        option,
        username: input.username,
        password: input.password,
      }),
    );
  }
  async browse(owner: string, connectionId: string, path: string, offset: number) {
    nasPath.parse(path);
    return this.exclusive(owner, () =>
      this.run({ action: "browse", owner, connectionId, path, offset }),
    );
  }
  async mount(
    owner: string,
    connectionId: string,
    path: string,
    sourceId: string,
    backup: boolean,
  ) {
    nasPath.parse(path);
    return this.exclusive(owner, () =>
      this.run({ action: "mount", owner, connectionId, path, sourceId, backup }),
    );
  }
  async forget(owner: string, connectionId: string) {
    return this.exclusive(owner, () => this.run({ action: "forget", owner, connectionId }));
  }
}
