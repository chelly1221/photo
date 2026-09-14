import { describe, expect, it } from "vitest";
import { albumDateRange } from "../src/lib/album-dates";

describe("album calendar dates", () => {
  it("includes both full local calendar days", () => {
    const range = albumDateRange("2026-09-01", "2026-09-02")!;
    expect(new Date(range.from)).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(new Date(range.to)).toEqual(new Date(2026, 8, 2, 23, 59, 59, 999));
    expect(albumDateRange("2024-02-29", "2024-02-29")).not.toBeNull();
  });
  it("rejects incomplete, nonexistent and reversed dates", () => {
    for (const [from, to] of [["", "2026-09-01"], ["2026-02-29", "2026-03-01"], ["2026-09-02", "2026-09-01"], ["2026-13-01", "2027-01-01"]])
      expect(albumDateRange(from, to)).toBeNull();
  });
});
