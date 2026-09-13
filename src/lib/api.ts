import Dexie, { type Table } from "dexie";
import { tailscaleFetch } from "./tailscale";
import type { Photo, Source } from "../../server/library";
export type { Photo, Source };
export const ORIGIN = "https://audax-vm.tail62313c.ts.net:8446";
class PhotoCache extends Dexie {
  media!: Table<{ id: string; blob: Blob; used: number; bytes: number }>;
  records!: Table<{ id: string; value: unknown }>;
  constructor() {
    super("photo-cache-v1");
    this.version(1).stores({ media: "id,used", records: "id" });
  }
}
export const cache = new PhotoCache();
let session = 0;
export const cacheSession = () => session;
export async function clearPrivateCache() {
  session++;
  await cache.media.clear();
  await cache.records.clear();
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await tailscaleFetch(ORIGIN + "/api" + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "서버 응답을 확인해 주세요.");
  }
  return response.json();
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
let active = 0;
const queue: (() => void)[] = [];
async function slot() {
  if (active >= 4) await new Promise<void>((r) => queue.push(r));
  active++;
  return () => {
    active--;
    queue.shift()?.();
  };
}
export async function media(
  photo: Pick<Photo, "id" | "version">,
  size: "thumb" | "preview",
  signal: AbortSignal,
) {
  const expected = session;
  const key = photo.id + "-" + photo.version + "-" + size;
  if (size === "thumb") {
    const saved = await cache.media.get(key);
    if (saved) {
      signal.throwIfAborted();
      return saved.blob;
    }
  }
  const release = await slot();
  try {
    signal.throwIfAborted();
    const response = await tailscaleFetch(`${ORIGIN}/api/media/${photo.id}/${size}`, { signal });
    if (!response.ok) throw new Error("미리보기를 불러오지 못했어요.");
    const blob = await response.blob();
    if (size === "thumb" && session === expected && !signal.aborted) {
      await cache.media.put({ id: key, blob, used: Date.now(), bytes: blob.size });
      if (session !== expected) await cache.media.delete(key);
      if ((await cache.media.count()) > 800) {
        const old = await cache.media.orderBy("used").limit(100).primaryKeys();
        await cache.media.bulkDelete(old);
      }
    }
    return blob;
  } finally {
    release();
  }
}
export async function downloadOriginal(photo: Photo) {
  if (photo.size > 250 * 1024 ** 2)
    throw new Error("250MB보다 큰 원본은 NAS에서 직접 다운로드해 주세요.");
  const chunks: BlobPart[] = [];
  for (let offset = 0; offset < photo.size;) {
    const r = await tailscaleFetch(`${ORIGIN}/api/media/${photo.id}/original?offset=${offset}`);
    if (!r.ok) throw new Error("원본 다운로드에 실패했어요.");
    const blob = await r.blob();
    if (!blob.size) throw new Error("파일 전송이 중단됐어요.");
    chunks.push(blob);
    offset += blob.size;
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}
