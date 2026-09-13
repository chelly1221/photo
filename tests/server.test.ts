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
  it("cannot upload into a read-only library", async () => {
    const s = await source();
    const b = new Backups(lib);
    await expect(
      b.begin({ sourceId: s.id, name: "x.jpg", bytes: 5, digest: "a".repeat(64) }),
    ).rejects.toThrow();
  });
});
