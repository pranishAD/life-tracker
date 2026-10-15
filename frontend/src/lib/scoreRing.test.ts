import { describe, expect, it } from "vitest";
import { computeRingGeometry } from "./scoreRing";

describe("computeRingGeometry", () => {
  it("matches the design's worked example (220px hero ring, score 78)", () => {
    // From design/screens-html/02-dashboard.html: r=101, stroke=18, score 78
    // -> dasharray 634.6, dashoffset 139.6 (design rounds to 1 decimal).
    const geo = computeRingGeometry(220, 18, 78);
    expect(geo.radius).toBeCloseTo(101, 5);
    expect(geo.circumference).toBeCloseTo(634.6, 1);
    expect(geo.dashoffset).toBeCloseTo(139.6, 1);
  });

  it("a score of 100 means no gap (dashoffset 0)", () => {
    const geo = computeRingGeometry(64, 6, 100);
    expect(geo.dashoffset).toBeCloseTo(0, 5);
  });

  it("a score of 0 means the full circumference is the gap", () => {
    const geo = computeRingGeometry(64, 6, 0);
    expect(geo.dashoffset).toBeCloseTo(geo.circumference, 5);
  });

  it("clamps out-of-range scores instead of drawing past a full circle", () => {
    const over = computeRingGeometry(64, 6, 150);
    const under = computeRingGeometry(64, 6, -20);
    expect(over.dashoffset).toBeCloseTo(0, 5);
    expect(under.dashoffset).toBeCloseTo(under.circumference, 5);
  });

  it("omits dashoffset for a null (Calibrating) score so callers draw a full dashed ring", () => {
    const geo = computeRingGeometry(64, 6, null);
    expect(geo.dashoffset).toBeUndefined();
  });

  it("centers the ring at size/2", () => {
    const geo = computeRingGeometry(140, 12, 50);
    expect(geo.center).toBe(70);
  });
});
