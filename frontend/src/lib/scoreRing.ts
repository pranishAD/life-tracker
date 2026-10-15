// Pure SVG arc math for ScoreRing, split out from the component so it's easy
// to unit test without rendering. Formula from design/components.md:
//   r = (size - stroke) / 2
//   c = 2*pi*r
//   strokeDasharray = c
//   strokeDashoffset = c * (1 - score / 100)
// The ring is drawn starting at 12 o'clock going clockwise by rotating the
// whole <svg> -90deg (see ScoreRing.tsx), so this file only needs to compute
// lengths, not angles.

export interface RingGeometry {
  center: number;
  radius: number;
  circumference: number;
  /** undefined while Calibrating — caller omits dasharray/dashoffset so the
   * whole dashed track shows (the "–" treatment), instead of a 0% arc. */
  dashoffset: number | undefined;
}

export function computeRingGeometry(size: number, stroke: number, score: number | null): RingGeometry {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = score === null ? null : Math.max(0, Math.min(100, score));
  const dashoffset = clamped === null ? undefined : circumference * (1 - clamped / 100);
  return { center: size / 2, radius, circumference, dashoffset };
}
