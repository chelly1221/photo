import { beforeEach, afterEach, describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { Library, safeRelative, type Photo } from "../server/library";
import { createApp } from "../server/app";
import { Backups } from "../server/backup";
let temp: string, root: string, lib: Library;
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "photo-test-"));
  root = path.join(temp, "nas");
  await fs.mkdir(root);
  const stateDir = path.join(temp, "state");
  await fs.mkdir(stateDir);
  lib = new Library({ stateDir, mountRoot: root, testRoots: { Photos: root } });
});
afterEach(async () => {
  await lib.close();
  await fs.rm(temp, { recursive: true, force: true });
});
async function source(backup = false) {
  const s = await lib.addSource({ name: "테스트 사진", share: "Photos", folder: "", backup });
  await lib.startScan();
  return s;
}
async function image(name = "a.jpg") {
  const file = path.join(root, name);
  await sharp({ create: { width: 600, height: 400, channels: 3, background: "#789abc" } })
    .jpeg()
    .toFile(file);
  return file;
}
describe("private NAS photo library", () => {
  it("requires authentication and explicit confirmation before deleting an original and album memberships", async () => {
    const file = await image();
    await source();
    const photo = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    const app = createApp(lib, ["owner@example.com"]);
    const headers = { "tailscale-user-login": "owner@example.com" };
    const album = (await app.inject({ method: "POST", url: "/api/albums", headers, payload: { name: "삭제 검증" } })).json();
    await app.inject({ method: "POST", url: `/api/albums/${album.id}/photos`, headers, payload: { action: "add", ids: [photo.id] } });
    const url = `/api/photos/${photo.id}`;
    const payload = { version: photo.version, confirmOriginal: true };
    expect((await app.inject({ method: "DELETE", url, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url, headers, payload: { version: photo.version } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url, headers, payload: { ...payload, version: "0000000000000000" } })).statusCode).toBe(409);
    await expect(fs.access(file)).resolves.toBeUndefined();
    expect((await app.inject({ method: "DELETE", url, headers, payload })).statusCode).toBe(200);
    await expect(fs.access(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(() => lib.get(photo.id)).toThrow();
    expect((await app.inject({ url: "/api/albums", headers })).json()[0].count).toBe(0);
    expect((await fs.readdir(path.join(lib.config.stateDir, "thumbs"))).some(name => name.startsWith(photo.id))).toBe(false);
    await lib.startScan();
    expect(lib.list({ offset: 0, limit: 1 }).total).toBe(0);
    await app.close();
  });
  it("preserves the index and original when the source is disabled or the file changed", async () => {
    const file = await image();
    const s = await source();
    const photo = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    lib.db.prepare("UPDATE sources SET enabled=0 WHERE id=?").run(s.id);
    await expect(lib.deletePhoto(photo.id, photo.version)).rejects.toMatchObject({ statusCode: 409 });
    lib.db.prepare("UPDATE sources SET enabled=1 WHERE id=?").run(s.id);
    await fs.appendFile(file, "changed");
    await expect(lib.deletePhoto(photo.id, photo.version)).rejects.toMatchObject({ statusCode: 409 });
    expect(lib.get(photo.id).id).toBe(photo.id);
    await expect(fs.access(file)).resolves.toBeUndefined();
  });
  it("rejects traversal in indexed deletion paths", async () => {
    await image();
    await source();
    const photo = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    lib.db.prepare("UPDATE photos SET relativePath='../outside.jpg' WHERE id=?").run(photo.id);
    await expect(lib.deletePhoto(photo.id, photo.version)).rejects.toThrow("경로");
    expect(lib.get(photo.id).id).toBe(photo.id);
  });
  it("fills a date-range album without pagination limits and keeps later edits", async () => {
    await image();
    const s = await source();
    const photo = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    const from = new Date("2026-09-01T00:00:00+09:00").getTime();
    const to = from + 200;
    lib.db.prepare("UPDATE photos SET takenAt=? WHERE id=?").run(from - 1, photo.id);
    const insert = lib.db.prepare(`INSERT INTO photos(id,sourceId,relativePath,name,folder,size,mtime,takenAt,width,height,version)
      VALUES(?,?,?,'test.jpg','',1,0,?,1,1,'test')`);
    for (let i = 0; i <= 201; i++) insert.run(`range-${i}`, s.id, `range-${i}.jpg`, from + i);
    const app = createApp(lib, ["owner@example.com"]);
    const headers = { "tailscale-user-login": "owner@example.com" };
    for (const range of [{ from }, { to }, { from: to, to: from }, { from: "bad", to }]) {
      expect((await app.inject({ method: "POST", url: "/api/albums", headers, payload: { name: "잘못된 기간", ...range } })).statusCode).toBe(400);
    }
    const create = async () => (await app.inject({ method: "POST", url: "/api/albums", headers, payload: { name: "기간 앨범", from, to } })).json();
    const album = await create();
    expect(album.count).toBe(201);
    const url = `/api/albums/${album.id}`;
    const first = (await app.inject({ url: url + "?limit=200", headers })).json();
    expect(first.items).toHaveLength(200);
    expect(first.next).toBe(200);
    expect((await app.inject({ url: url + "?offset=200", headers })).json().items[0].id).toBe("range-0");
    await app.inject({ method: "POST", url: url + "/photos", headers, payload: { action: "remove", ids: ["range-0"] } });
    insert.run("later-photo", s.id, "later.jpg", from + 1);
    expect((await app.inject({ url, headers })).json().album.count).toBe(200);
    lib.db.prepare("UPDATE sources SET enabled=0 WHERE id=?").run(s.id);
    expect((await create()).count).toBe(0);
    await app.close();
  });
  it("persists account-owned albums, edits membership atomically and preserves originals", async () => {
    const file = await image();
    const original = await fs.readFile(file);
    const s = await source();
    const photo = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    const app = createApp(lib, ["owner@example.com", "other@example.com"]);
    const headers = { "tailscale-user-login": "owner@example.com" };
    const other = { "tailscale-user-login": "other@example.com" };
    expect((await app.inject({ url: "/api/albums" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/albums", headers, payload: { name: "  " } })).statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: "/api/albums", headers, payload: { name: "여행" } });
    expect(created.statusCode).toBe(200);
    const url = `/api/albums/${created.json().id}`;
    expect((await app.inject({ url: "/api/albums", headers: other })).json()).toEqual([]);
    for (const method of ["GET", "PATCH", "DELETE"] as const)
      expect((await app.inject({ method, url, headers: other, ...(method === "PATCH" ? { payload: { name: "침범" } } : {}) })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: url + "/photos", headers: other, payload: { action: "add", ids: [photo.id] } })).statusCode).toBe(404);
    const membership = (action: string, ids: string[]) => app.inject({ method: "POST", url: url + "/photos", headers, payload: { action, ids } });
    expect((await membership("add", [photo.id, "missing-photo"])).statusCode).toBe(400);
    expect((await app.inject({ url, headers })).json().album.count).toBe(0);
    await membership("add", [photo.id, photo.id]);
    await membership("add", [photo.id]);
    expect((await app.inject({ url, headers })).json()).toMatchObject({ album: { count: 1 }, next: null });
    expect((await app.inject({ url: url + "?offset=1&limit=1", headers })).json().items).toEqual([]);
    await app.inject({ method: "PATCH", url, headers, payload: { name: "새 이름" } });
    await app.close();
    const reopened = createApp(lib, ["owner@example.com"]);
    expect((await reopened.inject({ url, headers })).json().album).toMatchObject({ name: "새 이름", count: 1 });
    lib.db.prepare("UPDATE sources SET enabled=0 WHERE id=?").run(s.id);
    expect((await reopened.inject({ url, headers })).json().album.count).toBe(0);
    lib.db.prepare("UPDATE sources SET enabled=1 WHERE id=?").run(s.id);
    await reopened.inject({ method: "POST", url: url + "/photos", headers, payload: { action: "remove", ids: [photo.id] } });
    expect(lib.get(photo.id).id).toBe(photo.id);
    await reopened.inject({ method: "DELETE", url, headers });
    expect((await reopened.inject({ url, headers })).statusCode).toBe(404);
    expect(await fs.readFile(file)).toEqual(original);
    await reopened.close();
  });
  it("recursively scans nested folders, preserves originals and skips hidden folders", async () => {
    await fs.mkdir(path.join(root, "2026", "여행", "첫째 날"), { recursive: true });
    await fs.mkdir(path.join(root, ".hidden"));
    const file = await image("2026/여행/첫째 날/a.jpg");
    await image(".hidden/hidden.jpg");
    const original = await fs.readFile(file);
    await source();
    const photos = lib.list({ offset: 0, limit: 120 });
    expect(photos.total).toBe(1);
    expect(photos.items[0]).toMatchObject({ folder: "2026/여행/첫째 날", relativePath: "2026/여행/첫째 날/a.jpg", error: null });
    expect(await fs.readFile(file)).toEqual(original);
    await lib.startScan();
    expect(lib.list({ offset: 0, limit: 120 }).total).toBe(1);
  });
  it("serves a prepared video in authenticated bounded chunks with validated offsets", async () => {
    await image("clip.mp4");
    await source();
    const photo = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    const file = path.join(lib.config.stateDir, "thumbs", `${photo.id}-${photo.version}-video.mp4`);
    await fs.writeFile(file, Buffer.alloc(2 * 1024 ** 2 + 13, 7));
    const app = createApp(lib, ["owner@example.com"]);
    const url = `/api/media/${photo.id}/video`;
    expect((await app.inject({ url })).statusCode).toBe(403);
    const headers = { "tailscale-user-login": "owner@example.com" };
    const first = await app.inject({ url, headers });
    expect(first.statusCode).toBe(200);
    expect(first.headers["x-media-size"]).toBe(String(2 * 1024 ** 2 + 13));
    expect(first.rawPayload.length).toBe(2 * 1024 ** 2);
    const last = await app.inject({ url: `${url}?offset=${2 * 1024 ** 2}`, headers });
    expect(last.rawPayload.length).toBe(13);
    expect((await app.inject({ url: `${url}?offset=-1`, headers })).statusCode).toBe(400);
    expect((await app.inject({ url: `${url}?offset=${2 * 1024 ** 2 + 13}`, headers })).statusCode).toBe(416);
    await app.close();
  });
  it("indexes months across unloaded pages and seeks to the same filtered sort order", async () => {
    await image();
    const s = await source();
    const original = lib.list({ offset: 0, limit: 1 }).items[0] as unknown as Photo;
    lib.db.prepare("UPDATE photos SET takenAt=?,favorite=1 WHERE id=?")
      .run(Date.UTC(2026, 8, 1), original.id);
    const insert = lib.db.prepare(`INSERT INTO photos
      (id,sourceId,relativePath,name,folder,size,mtime,takenAt,width,height,favorite,version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (let i = 0; i < 130; i++) {
      insert.run(`timeline-${i}`, s.id, `timeline-${i}.jpg`, `여행 ${i}.jpg`, "여행", 10, 0,
        i < 125 ? Date.UTC(2026, 7, 20) : Date.UTC(2024, 0, 1), 100, 100, i % 2, "test");
    }
    const newest = lib.timeline({ timezoneOffset: 540 });
    expect(newest).toEqual([
      { month: "2026-09", count: 1, offset: 0 },
      { month: "2026-08", count: 125, offset: 1 },
      { month: "2024-01", count: 5, offset: 126 },
    ]);
    const oldPhotos = lib.list({ offset: newest[2].offset, limit: 120 });
    expect(oldPhotos.items).toHaveLength(5);
    expect((oldPhotos.items[0] as unknown as Photo).takenAt).toBe(Date.UTC(2024, 0, 1));
    const oldest = lib.timeline({ timezoneOffset: 540, sort: "oldest" });
    expect(oldest.map((bucket) => bucket.offset)).toEqual([0, 5, 130]);
    const filtered = { q: "여행", folder: "여행", source: s.id, favorite: true, from: Date.UTC(2026, 0, 1) };
    expect(lib.timeline({ ...filtered, timezoneOffset: 540 }))
      .toEqual([{ month: "2026-08", count: lib.list({ ...filtered, offset: 0, limit: 120 }).total, offset: 0 }]);
    lib.db.prepare("UPDATE sources SET enabled=0 WHERE id=?").run(s.id);
    expect(lib.timeline({ timezoneOffset: 540 })).toEqual([]);
  });
  it("secures timeline metadata and applies the viewer's timezone at a month boundary", async () => {
    await image();
    await source();
    lib.db.prepare("UPDATE photos SET takenAt=?").run(Date.UTC(2026, 7, 31, 16));
    expect(lib.timeline({ timezoneOffset: 0 })[0].month).toBe("2026-08");
    expect(lib.timeline({ timezoneOffset: 540 })[0].month).toBe("2026-09");
    const app = createApp(lib, ["owner@example.com"]);
    expect((await app.inject("/api/timeline")).statusCode).toBe(403);
    const headers = { "tailscale-user-login": "owner@example.com" };
    const result = await app.inject({ url: "/api/timeline?timezoneOffset=540", headers });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual([{ month: "2026-09", count: 1, offset: 0 }]);
    expect((await app.inject({ url: "/api/timeline?timezoneOffset=900", headers })).statusCode).toBe(400);
    await app.close();
  });
  it("rejects missing/foreign identity and untrusted origins", async () => {
    const app = createApp(lib, ["owner@example.com"]);
    expect((await app.inject("/api/photos")).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/photos",
          headers: { "tailscale-user-login": "other@example.com" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/photos",
          headers: {
            "tailscale-user-login": "owner@example.com",
            origin: "https://photo.3chan.kr",
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/photos",
          headers: { "tailscale-user-login": "owner@example.com" },
        })
      ).statusCode,
    ).toBe(200);
    await app.close();
  });
  it("rejects traversal, absolute paths and foreign shares", async () => {
    for (const p of ["../secret", "a/../b", "/etc", "C:/etc", "a\\b"])
      expect(() => safeRelative(p)).toThrow();
    await expect(
      lib.addSource({ name: "x", share: "//elsewhere/data", folder: "", backup: false }),
    ).rejects.toThrow();
  });
  it("indexes original metadata, creates bounded previews and preserves favorites", async () => {
    const file = await image();
    await source();
    const photo = lib.list({ offset: 0, limit: 10 }).items[0] as unknown as Photo;
    expect(photo.width).toBe(600);
    expect(photo.height).toBe(400);
    const info = await sharp(await lib.thumb(photo.id, "thumb")).metadata();
    expect(info.width).toBe(480);
    await fs.unlink(await lib.thumb(photo.id,'thumb'));
    await lib.startScan();
    expect((await sharp(await lib.thumb(photo.id,'thumb')).metadata()).width).toBe(480);
    lib.favorite(photo.id, true);
    await fs.utimes(file, new Date(), new Date(Date.now() + 2000));
    await lib.startScan();
    expect(lib.get(photo.id).favorite).toBe(1);
    expect(lib.list({ q: "a.jpg", offset: 0, limit: 10 }).total).toBe(1);
    expect(lib.list({ q: "%", offset: 0, limit: 10 }).total).toBe(0);
  });
  it("retains catalog when NAS is inaccessible and reconciles complete scans", async () => {
    const file = await image();
    await source();
    await fs.rename(root, root + "-offline");
    await lib.startScan();
    expect(lib.list({ offset: 0, limit: 10 }).total).toBe(1);
    expect(lib.sources()[0].error).toBeTruthy();
    await fs.rename(root + "-offline", root);
    await fs.unlink(file);
    await lib.startScan();
    expect(lib.list({ offset: 0, limit: 10 }).total).toBe(0);
  });
  it("does not index symlinks outside the share", async () => {
    await image();
    await source();
    try {
      await fs.symlink(temp, path.join(root, "outside"), "junction");
    } catch {
      return;
    }
    await lib.startScan();
    expect(lib.list({ offset: 0, limit: 10 }).total).toBe(1);
  });
  it("resumes chunks, rejects out-of-order writes and deduplicates complete backups", async () => {
    const file = await image();
    const s = await source(true);
    const data = await fs.readFile(file);
    const digest = createHash("sha256").update(data).digest("hex");
    const backups = new Backups(lib);
    const task = await backups.begin({
      sourceId: s.id,
      name: "phone.jpg",
      bytes: data.length,
      digest,
    });
    expect(task.id).toBeTruthy();
    await backups.chunk(task.id!, 0, data.subarray(0, 100));
    await expect(backups.chunk(task.id!, 0, data)).rejects.toThrow();
    const resumed = await backups.begin({
      sourceId: s.id,
      name: "phone.jpg",
      bytes: data.length,
      digest,
    });
    expect(resumed.offset).toBe(100);
    await backups.chunk(task.id!, 100, data.subarray(100));
    const result = await backups.finish(task.id!);
    expect(await fs.readFile(path.join(root, result.relativePath))).toEqual(data);
    expect(
      await backups.begin({ sourceId: s.id, name: "phone.jpg", bytes: data.length, digest }),
    ).toEqual({ complete: true });
    expect(await fs.readFile(file)).toEqual(data);
  });
  it("accepts resumable large video metadata while enforcing format-specific limits", async () => {
    const s = await source(true);
    const b = new Backups(lib);
    const input = { sourceId: s.id, name: "clip.mov", bytes: 1024 ** 3, digest: "a".repeat(64) };
    const task = await b.begin(input);
    expect(task.id).toBeTruthy();
    expect((await fs.stat(b.temp(task.id!))).size).toBe(0);
    expect(await b.begin(input)).toEqual(task);
    await expect(b.begin({ ...input, name: "photo.heic" })).rejects.toThrow("250MB");
    await expect(b.begin({ ...input, bytes: 2 * 1024 ** 3 + 1 })).rejects.toThrow("2GB");
    await expect(b.begin({ ...input, name: "script.svg", bytes: 100 })).rejects.toThrow("지원하지 않는");
  });
  it("cannot upload into a read-only library", async () => {
    const s = await source();
    const b = new Backups(lib);
    await expect(
      b.begin({ sourceId: s.id, name: "x.jpg", bytes: 5, digest: "a".repeat(64) }),
    ).rejects.toThrow();
  });
});
