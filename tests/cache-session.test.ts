import "fake-indexeddb/auto";
import { afterEach, expect, test, vi } from "vitest";
import { cache, cacheSession, endCacheSession, media, forgetDeletedPhoto } from "../src/lib/api";
import { tailscaleFetch } from "../src/lib/tailscale";

vi.mock("../src/lib/tailscale", () => ({ tailscaleFetch: vi.fn() }));

afterEach(async () => {
  await cache.media.clear();
  await cache.records.clear();
  vi.resetAllMocks();
});
test("deleting a photo evicts only its media and invalidates old lists", async () => {
  for (const id of ["deleted-v1-thumb", "other-v1-thumb"]) await cache.media.put({ id, blob: new Blob([id]), used: 1, bytes: 1 });
  await cache.records.put({ id: "photos", value: { items: [{ id: "deleted" }] } });
  await forgetDeletedPhoto("deleted");
  expect(await cache.media.get("deleted-v1-thumb")).toBeUndefined();
  expect(await cache.media.get("other-v1-thumb")).toBeDefined();
  expect(await cache.records.count()).toBe(0);
});

test("ending a session preserves saved photos and thumbnails for the next login", async () => {
  const thumbnail = new Blob(["saved thumbnail"], { type: "image/jpeg" });
  await cache.media.put({ id: "photo-1-thumb", blob: thumbnail, used: 1, bytes: thumbnail.size });
  await cache.records.put({ id: "photos", value: { items: [{ id: "photo", favorite: true }] } });
  const previous = cacheSession();

  endCacheSession();

  expect(cacheSession()).not.toBe(previous);
  expect((await cache.records.get("photos"))?.value).toEqual({ items: [{ id: "photo", favorite: true }] });
  const saved = await media({ id: "photo", version: "1" }, "thumb", new AbortController().signal);
  expect(await saved.text()).toBe("saved thumbnail");
  expect(tailscaleFetch).not.toHaveBeenCalled();
});

test("a response arriving after logout cannot update the saved thumbnail cache", async () => {
  let respond!: (response: Response) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  vi.mocked(tailscaleFetch).mockImplementation(() => {
    started();
    return new Promise<Response>(resolve => { respond = resolve; });
  });
  const request = media({ id: "late-photo", version: "1" }, "thumb", new AbortController().signal);
  await requestStarted;
  endCacheSession();
  respond(new Response("late thumbnail"));
  await request;
  expect(await cache.media.get("late-photo-1-thumb")).toBeUndefined();
});
