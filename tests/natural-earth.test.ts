import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { naturalEarthStyle } from "../src/lib/natural-earth";

it("ships valid local map data and Korean city labels without remote map services", async () => {
  expect(naturalEarthStyle.glyphs).toBeUndefined();
  expect(naturalEarthStyle.sprite).toBeUndefined();
  for (const source of Object.values(naturalEarthStyle.sources)) {
    expect(source.type).toBe("geojson");
    if (source.type !== "geojson" || typeof source.data !== "string") throw new Error("Expected bundled GeoJSON");
    expect(source.data).toMatch(/^\/maps\/natural-earth\//);
    const data = JSON.parse(await readFile(`public${source.data}`, "utf8"));
    expect(data.type).toBe("FeatureCollection");
    expect(data.features.length).toBeGreaterThan(100);
    const finite = (coordinates: unknown): boolean => Array.isArray(coordinates) && coordinates.length > 0 &&
      (typeof coordinates[0] === "number" ? coordinates.every(Number.isFinite) : coordinates.every(finite));
    for (const feature of data.features) expect(finite(feature.geometry.coordinates)).toBe(true);
  }
  const labels = JSON.parse(await readFile("public/maps/natural-earth/labels.json", "utf8"));
  expect(labels).toEqual(expect.arrayContaining([expect.objectContaining({ name: "서울", kind: "city" }), expect.objectContaining({ name: "대한민국", kind: "country" })]));
});
