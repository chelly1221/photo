import { describe, expect, it } from "vitest";
import { galleryAnchor, galleryAnchorTop, pinchColumns, photoDateRange, photoSwipe, timelineMonthAt, timelinePointerPosition, timelineLabelIndices } from "../src/lib/gallery";

describe("gallery pinch", () => {
  it("spreads to larger photos and closes to more columns, within 1–6", () => {
    expect(pinchColumns(3, 1.5, 3)).toBe(2);
    expect(pinchColumns(3, 0.6, 3)).toBe(5);
    expect(pinchColumns(3, 10, 3)).toBe(1);
    expect(pinchColumns(3, 0.1, 3)).toBe(6);
  });
  it("ignores small tremors and does not oscillate at a rounding boundary", () => {
    expect(pinchColumns(3, 1.08, 3)).toBe(3);
    expect(pinchColumns(3, 3 / 2.49, 3)).toBe(3);
    expect(pinchColumns(3, 3 / 2.51, 2)).toBe(2);
    expect(pinchColumns(3, 0, 3)).toBe(3);
  });
  it("keeps the same point of a photo at the finger midpoint after reflow", () => {
    const anchor = galleryAnchor(378, 3, 640, 190, 190, 396);
    expect(anchor.index).toBe(19);
    const top = galleryAnchorTop(anchor, 378, 2, 620, 396);
    expect(Math.floor(anchor.index / 2) * 192 + anchor.fraction * 186 - top).toBeCloseTo(190);
    expect(galleryAnchorTop(anchor, 378, 3, 620, 396)).toBeCloseTo(640);
  });
  it("clamps at library ends and keeps partially visible top photos during toolbar changes", () => {
    const anchor = galleryAnchor(378, 3, 653, 0, 0, 396);
    expect(anchor.index).toBe(15);
    expect(galleryAnchorTop(anchor, 378, 6, 620, 396)).toBeCloseTo(128 + 13 / 122 * 58);
    expect(galleryAnchorTop({ index: 0, fraction: 0, y: 200 }, 378, 1, 620, 396)).toBe(0);
    expect(galleryAnchorTop({ index: 395, fraction: 1, y: 0 }, 378, 6, 620, 396)).toBe(3604);
    expect(galleryAnchorTop(anchor, 378, 6, 620, 3)).toBe(0);
  });
});

describe("pill month labels", () => {
  it("shows each available month when the pill has enough room", () => {
    expect(timelineLabelIndices(12, 600, 5)).toEqual(Array.from({ length: 12 }, (_, index) => index));
  });
  it("keeps the active month and separates its neighbors in a long library", () => {
    const labels = timelineLabelIndices(240, 436, 117);
    expect(labels).toContain(117);
    expect(labels.length).toBeLessThanOrEqual(14);
    expect(labels.filter((index) => index !== 117).every((index) => Math.abs(index - 117) / 239 * 400 >= 26)).toBe(true);
  });
  it("handles empty and single-month libraries", () => {
    expect(timelineLabelIndices(0, 436, 0)).toEqual([]);
    expect(timelineLabelIndices(1, 436, 0)).toEqual([0]);
  });
});

describe("timeline touch position", () => {
  it("maps top, center and bottom of the ruler to the full month range", () => {
    expect(timelinePointerPosition(118, 100, 436, 25)).toEqual({ fraction: 0, index: 0 });
    expect(timelinePointerPosition(318, 100, 436, 25)).toEqual({ fraction: 0.5, index: 12 });
    expect(timelinePointerPosition(518, 100, 436, 25)).toEqual({ fraction: 1, index: 24 });
  });
  it("clamps a captured finger beyond either end", () => {
    expect(timelinePointerPosition(-200, 100, 436, 25).index).toBe(0);
    expect(timelinePointerPosition(900, 100, 436, 25).index).toBe(24);
  });
  it("handles a single month and a very short viewport without invalid positions", () => {
    expect(timelinePointerPosition(318, 100, 436, 1).index).toBe(0);
    expect(timelinePointerPosition(200, 100, 20, 1)).toEqual({ fraction: 1, index: 0 });
  });
});

describe("timeline scroll position", () => {
  const months = [
    { month: "2026-09", count: 125, offset: 0 },
    { month: "2024-01", count: 5, offset: 125 },
    { month: "2020-12", count: 80, offset: 130 },
  ];
  it("changes months at the exact photo boundary beyond the first page", () => {
    expect(timelineMonthAt(months, 124)).toBe(0);
    expect(timelineMonthAt(months, 125)).toBe(1);
    expect(timelineMonthAt(months, 130)).toBe(2);
  });
  it("handles empty, initial and final scroll positions", () => {
    expect(timelineMonthAt([], 0)).toBe(0);
    expect(timelineMonthAt(months, 0)).toBe(0);
    expect(timelineMonthAt(months, 209)).toBe(2);
  });
});

describe("photo date filtering", () => {
  it("includes a photograph captured in the last millisecond of a selected day", () => {
    const range = photoDateRange("2026-09-14", "2026-09-14");
    expect(range.valid).toBe(true);
    expect(range.from).toBe(new Date(2026, 8, 14).getTime());
    expect(range.to).toBe(new Date(2026, 8, 15).getTime() - 1);
  });
  it("rejects a reversed range rather than presenting an empty library", () => {
    expect(photoDateRange("2026-09-14", "2026-09-01").valid).toBe(false);
  });
  it("supports either open end and clearing the filter", () => {
    expect(photoDateRange("", "2026-09-14").from).toBeUndefined();
    expect(photoDateRange("2026-09-14", "").to).toBeUndefined();
    expect(photoDateRange("", "")).toEqual({ valid: true, from: undefined, to: undefined });
  });
});

describe("viewer gestures", () => {
  it("moves to the next or previous photograph with a deliberate horizontal swipe", () => {
    expect(photoSwipe(-120, 12, 1)).toBe(1);
    expect(photoSwipe(120, -12, 1)).toBe(-1);
  });
  it("keeps the current photograph during a tap, vertical scroll or diagonal drag", () => {
    expect(photoSwipe(12, 4, 1)).toBe(0);
    expect(photoSwipe(80, 180, 1)).toBe(0);
    expect(photoSwipe(-100, 100, 1)).toBe(0);
  });
  it("pans an enlarged photograph without changing photographs", () => {
    expect(photoSwipe(-180, 0, 2)).toBe(0);
  });
});
