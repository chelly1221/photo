import { Capacitor, registerPlugin } from "@capacitor/core";
import { api, json, ORIGIN } from "./api";
import { tailscaleFetch } from "./tailscale";
import { drainBackupQueue } from './backup-queue';
export const PhotoBackup = registerPlugin<{
  configure(options: {
    enabled: boolean;
    wifiOnly: boolean;
    sourceId?: string;
  }): Promise<{ enabled: boolean }>;
  status(): Promise<{
    enabled: boolean;
    lastSuccess: number;
    outcome: string;
    permission: boolean;
    wifiOnly: boolean;
    sourceId: string;
  }>;
}>("PhotoBackup");
export const native = Capacitor.isNativePlatform();
declare global {
  interface Window {
    PhotoMedia?: {
      listAsync(requestId: string): void;
      read(id: string, offset: number, length: number): string;
      complete(id: string): void;
    };
    BackgroundSyncNative?: { complete(outcome: string): void };
  }
}
async function send(
  sourceId: string,
  name: string,
  bytes: number,
  digest: string,
  read: (offset: number, length: number) => Promise<Uint8Array>,
  onProgress: (n: number) => void,
) {
  let task = await api<{ id?: string; offset?: number; complete: boolean }>(
    "/backups",
    json("POST", { sourceId, name, bytes, digest }),
  );
  if (task.complete) return;
  let offset = task.offset ?? 0;
  while (offset < bytes) {
    const chunk = await read(offset, Math.min(1024 ** 2, bytes - offset));
    const response = await tailscaleFetch(`${ORIGIN}/api/backups/${task.id}?offset=${offset}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: chunk as BodyInit,
    });
    if (!response.ok) throw new Error("백업 전송이 중단됐어요. 다시 실행하면 이어서 전송해요.");
    const body = await response.json();
    offset = body.offset;
    onProgress(offset / bytes);
  }
  await api(`/backups/${task.id}/complete`, json("POST", {}));
}
export async function backupFiles(
  files: File[],
  sourceId: string,
  onProgress: (text: string) => void,
) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 250 * 1024 ** 2)
      throw new Error(`${file.name}: 250MB 이하 사진만 백업할 수 있어요.`);
    onProgress(`${i + 1}/${files.length} · ${file.name} 확인 중`);
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const digest = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    await send(
      sourceId,
      file.name,
      file.size,
      digest,
      async (o, l) => new Uint8Array(await file.slice(o, o + l).arrayBuffer()),
      (n) => onProgress(`${i + 1}/${files.length} · ${Math.round(n * 100)}%`),
    );
  }
  onProgress(`${files.length}장 백업 완료`);
}
let running = false;
type NativePhoto = { id: string; name: string; bytes: number; digest: string };
async function listNative(): Promise<NativePhoto[]> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("photo-native-result", handler);
      reject(new Error("사진 확인 시간이 초과됐어요. 다시 시도해 주세요."));
    }, 120000);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("photo-native-result", handler);
      if (detail.error) reject(new Error(detail.error));
      else resolve(detail.items);
    };
    window.addEventListener("photo-native-result", handler);
    window.PhotoMedia!.listAsync(id);
  });
}
export async function backupPhone(onProgress: (text: string) => void = () => {}) {
  if (running || !window.PhotoMedia) return;
  const sourceId = localStorage.getItem("photo-backup-source");
  if (!sourceId) return;
  running = true;
  try {
    const result = await drainBackupQueue({
      list: listNative,
      budgetMs: window.BackgroundSyncNative ? 120000 : undefined,
      process: async (file, completed) => {
      onProgress(`${completed}장 완료 · ${file.name} 백업 중`);
      if (
        localStorage.getItem("photo-backup-source") !== sourceId ||
        localStorage.getItem("photo-auto-backup") !== "yes"
      )
        throw new Error("백업 설정이 변경되어 전송을 멈췄어요.");
      await send(
        sourceId,
        file.name,
        file.bytes,
        file.digest,
        async (o, l) =>
          Uint8Array.from(atob(window.PhotoMedia!.read(file.id, o, l)), (c) => c.charCodeAt(0)),
        () => {},
      );
      window.PhotoMedia!.complete(file.id);
      },
    });
    onProgress(result.pending ? `${result.completed}장 백업했어요. 남은 사진은 다음 작업에서 이어서 백업해요.` : result.completed ? `${result.completed}장 백업 완료` : "새로운 사진이 없어요.");
    return result;
  } finally {
    running = false;
  }
}
