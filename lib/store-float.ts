import { clamp, random } from "./scene/math";

/** The field's depths: how fast each moves with the scroll and how large its products are. */
export const LAYERS = [
  { speed: 0.7, size: 0.8 },
  { speed: 1, size: 1 },
  { speed: 1.3, size: 1.06 },
] as const;

/** The field's length in screens. */
export const FIELD_SCREENS = 4.6;

/** How the field is filled: products per screen and the least gap between centres (share of the width). */
export type FieldDensity = { perScreen: number; gap: number };
export const FIELD: Record<"desktop" | "phone", FieldDensity> = {
  desktop: { perScreen: 6.5, gap: 0.12 },
  phone: { perScreen: 4.5, gap: 0.3 },
};

/** A product's place: x as a share of the width, y in screens down the field, its layer. */
export type FieldPoint = { x: number; y: number; layer: number };

/** How far down the field (screens) a layer must reach to keep the screen filled to the end. */
const reach = (layer: number) => LAYERS[layer].speed * (FIELD_SCREENS - 1) + 1;
/** Where products may stand: clear of the label at the top, a little cut by the side edges. */
const AREA = { left: 0.03, right: 0.97, top: 0.1 };

/** Products in each layer: the same share of the screen for each, so the density holds along the field. */
export function fieldCounts(perScreen: number) {
  return LAYERS.map((_, layer) => Math.round((perScreen / LAYERS.length) * reach(layer)));
}

/**
 * Seeded blue noise over the field (best of many candidates, Mitchell): each new product goes where
 * it is farthest from the others, measured on screen at the scroll that brings it to mid-screen,
 * so the layers keep apart as they slide past each other. `aspect` is the screen's width / height.
 * Sorted by the scroll they show at, so the n-th product of a set lands at the n-th place.
 */
export function fieldLayout(aspect: number, density: FieldDensity, seed = 21): FieldPoint[] {
  const rand = random(seed);
  const left = fieldCounts(density.perScreen);
  const total = left.reduce((a, b) => a + b, 0);
  const gap = density.gap * aspect;
  const points: (FieldPoint & { at: number })[] = [];
  for (let i = 0; points.length < total; i++) {
    const layer = i % LAYERS.length;
    if (!left[layer]) continue;
    left[layer]--;
    const { speed } = LAYERS[layer];
    let best = { x: 0.5, y: 0.5, layer, at: 0 };
    let far = -1;
    for (let k = 0; k < 24 || (far < gap && k < 120); k++) {
      const x = AREA.left + rand() * (AREA.right - AREA.left);
      const y = AREA.top + rand() * (reach(layer) - AREA.top);
      const at = clamp((y - 0.5) / speed, 0, FIELD_SCREENS - 1);
      let near = Infinity;
      for (const p of points) {
        const dy = y - speed * at - (p.y - LAYERS[p.layer].speed * at);
        near = Math.min(near, Math.hypot((x - p.x) * aspect, dy));
      }
      if (near > far) {
        far = near;
        best = { x, y, layer, at };
      }
    }
    points.push(best);
  }
  return points.sort((a, b) => a.at - b.at).map(({ x, y, layer }) => ({ x, y, layer }));
}

/** A product's width in the middle layer (vw) from its catalogue size: a can ~5, a hoodie ~10. */
export function fieldWidth(float: number, phone: boolean) {
  return phone ? 12 + float * 0.75 : 1.6 + float * 0.58;
}

/** The whole store afloat: one from each part in turn, so neighbours in the field differ. */
export function interleave<T>(items: T[], group: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = group(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) for (const list of lists) if (list[i] !== undefined) out.push(list[i]);
  return out;
}
