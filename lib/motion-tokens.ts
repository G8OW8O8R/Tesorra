/**
 * Motion tokens shared by DOM transitions and scroll-driven animation.
 * Durations in milliseconds, easings as cubic-bezier control points.
 * Mirrored as CSS custom properties in app/globals.css.
 */

export const duration = {
  instant: 90,
  fast: 180,
  base: 320,
  slow: 640,
  /** Chapter-to-chapter camera ride triggered from the chapter index. */
  ride: 1600,
  /** Cross-fade used in place of movement under prefers-reduced-motion. */
  fade: 200,
} as const;

export type Bezier = readonly [number, number, number, number];

export const easing = {
  /** Default for UI state changes. */
  standard: [0.2, 0, 0, 1],
  /** Elements entering the view. */
  out: [0.16, 1, 0.3, 1],
  /** Elements leaving the view. */
  in: [0.7, 0, 0.84, 0],
  /** Long camera rides: slow start, fast middle, long settle. */
  ride: [0.65, 0, 0.35, 1],
} as const satisfies Record<string, Bezier>;

export function cssEasing(curve: Bezier): string {
  return `cubic-bezier(${curve.join(", ")})`;
}

/** Evaluates a cubic-bezier easing at t in [0, 1] (for JS-driven animation). */
export function bezierAt(curve: Bezier, t: number): number {
  const [x1, y1, x2, y2] = curve;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleDX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  let s = t;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(s) - t;
    if (Math.abs(err) < 1e-6) break;
    const d = sampleDX(s);
    if (Math.abs(d) < 1e-6) break;
    s -= err / d;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20 && Math.abs(sampleX(s) - t) >= 1e-6; i++) {
    if (sampleX(s) < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return ((ay * s + by) * s + cy) * s;
}
