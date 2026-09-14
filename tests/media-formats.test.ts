import { describe, it, expect } from "vitest";
import { supportsMedia, isVideo, isRaw, mediaExtensions } from "../src/lib/media-formats";
import fs from "node:fs";

describe("media format contract", () => {
  it("recognizes camera RAW, modern stills and video containers case-insensitively", () => {
    for (const name of ["IMG.HEIC", "IMG.CR3", "IMG.NEF", "IMG.DNG", "IMG.JXL", "clip.MOV", "clip.M2TS", "clip.MKV"]) expect(supportsMedia(name)).toBe(true);
    expect(isVideo("clip.MOV")).toBe(true);
    expect(isVideo("IMG.CR3")).toBe(false);
    expect(isRaw("IMG.CR3")).toBe(true);
    for (const name of ["script.exe", "document.pdf", "playlist.m3u8", "jpg", "image.jpg.exe"]) expect(supportsMedia(name)).toBe(false);
  });
  it("keeps Android automatic backup and server format acceptance in agreement", () => {
    const source = fs.readFileSync("android/app/src/main/java/kr/threechan/photo/MediaFormats.java", "utf8");
    const literals = [...source.matchAll(/"([a-z0-9]+)"/g)].map(match => match[1]);
    expect(literals.sort()).toEqual([...mediaExtensions].sort());
  });
});
