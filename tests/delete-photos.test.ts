import { describe, expect, it } from "vitest";
import { deletePhotos } from "../src/lib/delete-photos";
import type { Photo } from "../src/lib/api";

describe("multi-photo deletion", () => {
  it("runs sequentially, keeps successes and retries only failed originals", async () => {
    const photos = ["one", "two", "three"].map(id => ({ id }) as Photo);
    const calls: string[] = [];
    let active = 0;
    const result = await deletePhotos(photos, async photo => {
      expect(++active).toBe(1);
      calls.push(photo.id);
      await Promise.resolve();
      active--;
      if (photo.id === "two") throw new Error("NAS 연결 끊김");
    });
    expect(calls).toEqual(["one", "two", "three"]);
    expect(result.deleted).toEqual(["one", "three"]);
    expect(result.failed).toEqual([{ photo: photos[1], message: "NAS 연결 끊김" }]);
    const retry = await deletePhotos(result.failed.map(item => item.photo), async photo => { calls.push(photo.id); });
    expect(retry.deleted).toEqual(["two"]);
    expect(retry.failed).toEqual([]);
    expect(calls).toEqual(["one", "two", "three", "two"]);
  });
});
