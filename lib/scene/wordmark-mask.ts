import { WORDMARK_PATH } from "@/components/brand/wordmark-path";
import type { MarkMask } from "./protocol";

/** viewBox of the wordmark path. */
const VIEW = { width: 489.1, height: 100 };
/** Slant of the letters: x shift per unit of height (viewBox units). */
const SLANT = 0.2;

type Box = { min: number; max: number; x0: number; y0: number; x1: number; y1: number };

/**
 * Letters of the wordmark from left to right, as extents along the slanted x. Each closed outline
 * of the path is a letter, a counter inside one (O, R) or a piece of one; overlapping extents are
 * the same letter.
 */
function letterExtents(): Box[] {
  const outlines = WORDMARK_PATH.split("M")
    .map((part) => (part.match(/-?\d*\.?\d+/g) ?? []).map(Number))
    .filter((n) => n.length >= 6)
    .map((n) => {
      const box: Box = { min: Infinity, max: -Infinity, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (let i = 0; i + 1 < n.length; i += 2) {
        const [x, y] = [n[i], n[i + 1]];
        const slanted = x + SLANT * (y - VIEW.height / 2);
        box.min = Math.min(box.min, slanted);
        box.max = Math.max(box.max, slanted);
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
      return box;
    });
  const inside = (a: Box, b: Box) => a !== b && a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
  const letters: Box[] = [];
  for (const box of outlines.filter((a) => !outlines.some((b) => inside(a, b))).sort((a, b) => a.min - b.min)) {
    const last = letters.at(-1);
    const overlap = last ? last.max - box.min : 0;
    if (last && overlap > 0.5 * Math.min(last.max - last.min, box.max - box.min)) last.max = Math.max(last.max, box.max);
    else letters.push({ ...box });
  }
  return letters;
}

/**
 * Rasterises the wordmark for the scene (`width` texels wide): coverage only, plus where one letter
 * ends and the next begins, so the letters can gather from dust one after another.
 */
export function buildMarkMask(width: number): MarkMask | null {
  const height = Math.round((width * VIEW.height) / VIEW.width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(width / VIEW.width, height / VIEW.height);
  ctx.fill(new Path2D(WORDMARK_PATH), "evenodd");
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];

  const letters = letterExtents();
  const cuts = letters.slice(1).map((box, i) => (letters[i].max + box.min) / 2 / VIEW.width);
  return { width, height, data, cuts, slope: (SLANT * VIEW.height) / VIEW.width };
}
