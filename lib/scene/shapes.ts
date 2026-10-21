import type { SceneTuning } from "@/lib/scene-tuning";
import { gaussian, lerp, random } from "./math";
import type { Cloud } from "./particles";
import type { Track } from "./track";

/**
 * Procedural point clouds for the bodies without a scanned model (the start gantry and the bike's
 * rider), in the same layout as the .f32 files: xyz triples, +X forward,
 * Y up. They go through the same surface analysis as the models, so they densify and glow on
 * edges alike.
 */

type V3 = [number, number, number];
type Rand = () => number;
type Part = { weight: number; sample: (r: Rand) => V3 };

const TAU = Math.PI * 2;

/** Points spread over weighted surface parts. */
function surface(count: number, seed: number, parts: Part[], place: (p: V3, r: Rand) => V3 = (p) => p) {
  const rand = random(seed);
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let pick = rand() * total;
    let part = parts[parts.length - 1];
    for (const candidate of parts) {
      pick -= candidate.weight;
      if (pick <= 0) {
        part = candidate;
        break;
      }
    }
    out.set(place(part.sample(rand), rand), i * 3);
  }
  return out;
}

/** Two unit vectors at right angles to `axis`. */
function basis(axis: V3): [V3, V3] {
  const len = Math.hypot(...axis) || 1;
  const n: V3 = [axis[0] / len, axis[1] / len, axis[2] / len];
  const ref: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1: V3 = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
  const l1 = Math.hypot(...e1);
  e1[0] /= l1;
  e1[1] /= l1;
  e1[2] /= l1;
  const e2: V3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return [e1, e2];
}

/** Surface of a capsule from a to b, with a rounded cap at b (a fingertip). */
function capsule(a: V3, b: V3, radius: number, r: Rand): V3 {
  const axis: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...axis);
  const [e1, e2] = basis(axis);
  const angle = r() * TAU;
  const round = r() < radius / (len + radius);
  if (round) {
    // Hemisphere on b.
    const z = r();
    const s = Math.sqrt(1 - z * z);
    const n: V3 = [axis[0] / len, axis[1] / len, axis[2] / len];
    return [0, 1, 2].map(
      (k) => b[k] + (e1[k] * Math.cos(angle) * s + e2[k] * Math.sin(angle) * s + n[k] * z) * radius,
    ) as V3;
  }
  const t = r();
  return [0, 1, 2].map(
    (k) => a[k] + axis[k] * t + (e1[k] * Math.cos(angle) + e2[k] * Math.sin(angle)) * radius,
  ) as V3;
}

/** Surface of an ellipsoid (not area-uniform, which reads as denser rims). */
function ellipsoid(centre: V3, semi: V3, r: Rand): V3 {
  const z = r() * 2 - 1;
  const a = r() * TAU;
  const s = Math.sqrt(1 - z * z);
  return [centre[0] + Math.cos(a) * s * semi[0], centre[1] + z * semi[1], centre[2] + Math.sin(a) * s * semi[2]];
}

/**
 * Rider in a racing tuck for the bike model (model units: wheels at y = -0.53, seat near x = -0.4,
 * clip-ons near x = 0.45). The knee on the `inside` side (+1 = +Z) is out and down for the lean.
 */
export function riderShape(count: number, inside: number) {
  const s = inside < 0 ? -1 : 1;
  const limb = (a: V3, b: V3, radius: number, weight: number): Part => ({
    weight,
    sample: (r) => capsule(a, b, radius, r),
  });
  const arms = [-1, 1].flatMap((z): Part[] => [
    limb([0.06, 0.66, z * 0.17], [0.24, 0.52, z * 0.25], 0.055, 0.05),
    limb([0.24, 0.52, z * 0.25], [0.46, 0.46, z * 0.21], 0.05, 0.045),
  ]);
  return surface(count, 67, [
    // Hips on the seat, back stretched over the tank, hump behind the helmet.
    { weight: 0.12, sample: (r) => ellipsoid([-0.38, 0.43, 0], [0.15, 0.1, 0.17], r) },
    limb([-0.36, 0.47, 0], [0.1, 0.64, 0], 0.15, 0.24),
    { weight: 0.04, sample: (r) => ellipsoid([-0.12, 0.72, 0], [0.12, 0.06, 0.08], r) },
    // Helmet tucked down behind the screen, with its visor edge.
    { weight: 0.1, sample: (r) => ellipsoid([0.27, 0.75, 0], [0.15, 0.13, 0.13], r) },
    {
      weight: 0.02,
      sample: (r) => {
        const a = (r() - 0.5) * 2.2;
        return [0.27 + Math.cos(a) * 0.15, 0.74 + gaussian(r) * 0.008, Math.sin(a) * 0.13];
      },
    },
    ...arms,
    // Outside leg tucked against the tank, foot on the peg.
    limb([-0.36, 0.42, -s * 0.15], [-0.02, 0.36, -s * 0.27], 0.08, 0.08),
    limb([-0.02, 0.36, -s * 0.27], [-0.32, 0.08, -s * 0.22], 0.06, 0.05),
    // Inside leg: knee out towards the road.
    limb([-0.36, 0.42, s * 0.15], [-0.04, 0.15, s * 0.56], 0.08, 0.08),
    limb([-0.04, 0.15, s * 0.56], [-0.34, 0.06, s * 0.26], 0.06, 0.05),
    { weight: 0.02, sample: (r) => ellipsoid([-0.04, 0.12, s * 0.6], [0.05, 0.04, 0.03], r) },
  ]);
}

/** Start gantry layout (metres): posts either side of the road, a box truss and five round lights. */
export const GANTRY = {
  span: 5.8,
  top: 6.6,
  low: 5.7,
  depth: 0.35,
  post: 0.18,
  /** Round lights: centres across the road, height, their camera-facing side and lamp radius. */
  lamps: [-2.2, -1.1, 0, 1.1, 2.2],
  lampY: 5.0,
  lampX: -0.25,
  lampRadius: 0.4,
} as const;

type Segment = [V3, V3];

/** Zigzag lacing between two parallel chords, every `step` along them. */
function lacing(a0: V3, a1: V3, b0: V3, b1: V3, step: number): Segment[] {
  const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
  const n = Math.max(1, Math.round(len / step));
  const at = (p: V3, q: V3, t: number): V3 => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const from = i % 2 === 0 ? at(a0, a1, i / n) : at(b0, b1, i / n);
    const to = i % 2 === 0 ? at(b0, b1, (i + 1) / n) : at(a0, a1, (i + 1) / n);
    out.push([from, to]);
  }
  return out;
}

export function gantryShape(count: number) {
  const g = GANTRY;
  const segments: Segment[] = [];
  const w = g.post;
  // Posts: four corner chords each, laced on the faces towards and away from the road.
  for (const s of [-1, 1]) {
    const z = s * g.span;
    for (const [x, dz] of [
      [-w, -w],
      [w, -w],
      [-w, w],
      [w, w],
    ]) {
      segments.push([
        [x, 0, z + dz],
        [x, g.top, z + dz],
      ]);
    }
    for (const x of [-w, w]) {
      segments.push(...lacing([x, 0, z - w], [x, g.top, z - w], [x, 0, z + w], [x, g.top, z + w], 0.5));
    }
  }
  // Beam: four chords across the road, laced on all four faces.
  const zs = g.span + w;
  const d = g.depth;
  const chord = (x: number, y: number): Segment => [
    [x, y, -zs],
    [x, y, zs],
  ];
  const chords = [chord(-d, g.low), chord(d, g.low), chord(-d, g.top), chord(d, g.top)];
  segments.push(...chords);
  const faces: [Segment, Segment][] = [
    [chords[0], chords[2]],
    [chords[1], chords[3]],
    [chords[0], chords[1]],
    [chords[2], chords[3]],
  ];
  for (const [a, b] of faces) segments.push(...lacing(a[0], a[1], b[0], b[1], 0.75));
  // Each light hangs from the beam on two short rods.
  for (const z of g.lamps) {
    for (const dz of [-0.18, 0.18]) {
      segments.push([
        [0, g.lampY + g.lampRadius + 0.06, z + dz],
        [0, g.low, z + dz],
      ]);
    }
  }
  const lineParts: Part[] = segments.map(([a, b]) => ({
    weight: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
    sample: (r) => {
      const t = r();
      return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t + gaussian(r) * 0.022) as V3;
    },
  }));
  const pods: Part[] = g.lamps.flatMap((z): Part[] => [
    {
      // Bezel round each lamp.
      weight: 1.2,
      sample: (r) => {
        const a = r() * TAU;
        const rr = g.lampRadius + 0.06 + gaussian(r) * 0.015;
        return [g.lampX + gaussian(r) * 0.01, g.lampY + Math.cos(a) * rr, z + Math.sin(a) * rr];
      },
    },
    {
      // Round housing reaching back from the bezel.
      weight: 1,
      sample: (r) => {
        const a = r() * TAU;
        const rr = g.lampRadius + 0.06;
        return [g.lampX + r() * 0.4, g.lampY + Math.cos(a) * rr, z + Math.sin(a) * rr];
      },
    },
  ]);
  return surface(count, 47, [...lineParts, ...pods]);
}

/**
 * The five lamp discs on the gantry's camera side (model space, one array per lamp): dense dust
 * filling the lens, a little thicker towards its rim.
 */
export function lampShapes(perLamp: number) {
  const g = GANTRY;
  const rand = random(53);
  return g.lamps.map((z) => {
    const out = new Float32Array(perLamp * 3);
    for (let i = 0; i < perLamp; i++) {
      const a = rand() * TAU;
      const rim = rand() < 0.2;
      const rr = g.lampRadius * (rim ? 1 - Math.abs(gaussian(rand)) * 0.05 : Math.sqrt(rand()));
      out.set([g.lampX - 0.01 - rand() * 0.04, g.lampY + Math.cos(a) * rr, z + Math.sin(a) * rr], i * 3);
    }
    return out;
  });
}

/**
 * Starting grid in dust on the road before the gantry: a start line across the road and staggered
 * slots, each a soft stroke across its lane (fading out towards both ends) over a faint pool of
 * dust where the car stands. No hard corners anywhere.
 */
export function buildGrid(
  track: Track,
  gantry: number,
  spec: SceneTuning["live"]["grid"],
  t: SceneTuning["track"],
  count: number,
): Cloud {
  const rand = random(59);
  /** A stroke across the road at d from u0 to u1, or a pool around (d, u) when `pool` is set. */
  type Mark = { d: number; u0: number; u1: number; thick: number; pool?: [number, number] };
  const marks: Mark[] = [{ d: gantry - 2, u0: -t.halfWidth, u1: t.halfWidth, thick: 0.1 }];
  for (let k = 0; k < spec.slots; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const d = gantry - spec.from - (k * spec.spacing) / 2;
    const u = side * spec.offset;
    const half = spec.width / 2;
    marks.push({ d, u0: u - half, u1: u + half, thick: 0.07 });
    marks.push({ d: d - spec.depth, u0: u, u1: u, thick: 0, pool: [spec.depth * 0.6, half * 0.7] });
  }
  const weights = marks.map((m) => (m.pool ? 0.9 : m.u1 - m.u0));
  const total = weights.reduce((a, b) => a + b, 0);

  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let pick = rand() * total;
    let m = marks[marks.length - 1];
    for (let j = 0; j < marks.length; j++) {
      pick -= weights[j];
      if (pick <= 0) {
        m = marks[j];
        break;
      }
    }
    let d: number;
    let u: number;
    if (m.pool) {
      d = m.d + gaussian(rand) * m.pool[0];
      u = m.u0 + gaussian(rand) * m.pool[1];
    } else {
      // Denser in the middle of the stroke, thinning to nothing at its ends.
      let k = rand();
      while (rand() > Math.sin(Math.PI * k) ** 0.6) k = rand();
      d = m.d + gaussian(rand) * m.thick * (0.6 + Math.sin(Math.PI * k));
      u = lerp(m.u0, m.u1, k) + gaussian(rand) * 0.04;
    }
    const f = track.frame(d);
    positions[i * 3] = f.pos[0] + f.side[0] * u;
    positions[i * 3 + 1] = f.pos[1] + t.surfaceLift + Math.abs(gaussian(rand)) * t.edgeLift;
    positions[i * 3 + 2] = f.pos[2] + f.side[2] * u;
  }
  return { positions, seeds, count };
}
