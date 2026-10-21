import type { SceneTuning } from "@/lib/scene-tuning";
import { gaussian, random, smoothstep } from "./math";
import type { Track } from "./track";

/** Instance data for one draw: xyz per particle plus four random seeds in 0..1. */
export type Cloud = { positions: Float32Array; seeds: Float32Array; count: number };

type Counts = Record<keyof SceneTuning["counts"]["desktop"], number>;

function cloud(count: number, rand: () => number): Cloud {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  return { positions: new Float32Array(count * 3), seeds, count };
}

/** Smooth 1D value noise in −1..1. */
function noise(seed: number) {
  const rand = random(seed);
  const lattice = Float32Array.from({ length: 1024 }, () => rand() * 2 - 1);
  const at = (i: number) => lattice[((i % 1024) + 1024) % 1024];
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    return at(i) + (at(i + 1) - at(i)) * f * f * (3 - 2 * f);
  };
}

function place(c: Cloud, i: number, track: Track, d: number, u: number, h: number) {
  const f = track.frame(d);
  c.positions[i * 3] = f.pos[0] + f.side[0] * u;
  c.positions[i * 3 + 1] = f.pos[1] + h;
  c.positions[i * 3 + 2] = f.pos[2] + f.side[2] * u;
}

export function buildTrackClouds(track: Track, t: SceneTuning["track"], counts: Counts) {
  const rand = random(21);
  const from = -t.lead;
  const span = track.length + t.lead + t.tail;

  // Road surface: stratified along the track so there are no bald patches; part of it gathers
  // towards the edges so the sides glow brighter than the middle.
  const [edgeShare, edgeFalloff] = t.roadEdges;
  const road = cloud(counts.road, rand);
  for (let i = 0; i < road.count; i++) {
    const d = from + ((i + rand()) / road.count) * span;
    const u =
      rand() < edgeShare
        ? (rand() < 0.5 ? -1 : 1) * Math.max(0, t.halfWidth + Math.log(1 - rand() * 0.999) * edgeFalloff)
        : (rand() * 2 - 1) * t.halfWidth;
    place(road, i, track, d, u, Math.abs(gaussian(rand)) * t.surfaceLift);
  }

  // Edges: bands of denser dust inside each road edge, both borders torn by noise.
  const band = t.edgeBand * t.halfWidth * 2;
  const [amp, long, short] = t.edgeRagged;
  const borders = [1, 2, 3, 4].map((k) => {
    const a = noise(k * 11);
    const b = noise(k * 17);
    return (d: number) => amp * (0.65 * a(d / long) + 0.35 * b(d / short));
  });
  const edge = cloud(counts.edge, rand);
  for (let i = 0; i < edge.count; i++) {
    const d = from + ((Math.floor(i / 2) + rand()) / (edge.count / 2)) * span;
    const right = i % 2 === 0;
    const inner = t.halfWidth - band + borders[right ? 0 : 2](d);
    const outer = Math.max(inner + band * 0.3, t.halfWidth + borders[right ? 1 : 3](d));
    const u = (right ? 1 : -1) * (inner + rand() * (outer - inner));
    place(edge, i, track, d, u, t.surfaceLift + Math.abs(gaussian(rand)) * t.edgeLift);
  }

  // Terrain: banks and rolling hills either side, dense by the track, thinning out to the horizon.
  const hills = t.hills;
  const k = (2 * Math.PI) / hills.wave;
  const hill = (x: number, z: number) =>
    0.55 * Math.sin(x * k * 0.7 + 1.3) * Math.cos(z * k * 0.9) + 0.45 * Math.sin((x + z) * k * 1.7 + 0.4);
  const clearance = t.halfWidth + t.terrainGap;
  const toTrack = distanceField(track, from, span, t.terrainReach);

  const terrain = cloud(counts.terrain, rand);
  for (let i = 0; i < terrain.count; i++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const f = track.frame(from + rand() * span);
      const near = rand() < t.terrainNear;
      const out = near
        ? -Math.log(1 - rand() * 0.999) * t.terrainSpread
        : 40 * Math.pow(t.terrainReach / 40, rand());
      // Far dust fans out around the side vector so it does not line up in rows.
      const a = near ? 0 : (rand() * 2 - 1) * 0.9;
      const s = rand() < 0.5 ? -1 : 1;
      const dx = s * (f.side[0] * Math.cos(a) + f.tangent[0] * Math.sin(a));
      const dz = s * (f.side[2] * Math.cos(a) + f.tangent[2] * Math.sin(a));
      const x = f.pos[0] + dx * (clearance + out);
      const z = f.pos[2] + dz * (clearance + out);
      // Height follows the distance to the nearest stretch of track, so banks never cover the road.
      const off = toTrack(x, z) - t.halfWidth;
      if (off < t.terrainGap && attempt < 7) continue;
      const bank = smoothstep(hills.bankFrom, hills.bankTo, off);
      const rise = bank * (hills.bank + hills.height * (0.5 + 0.5 * hill(x, z)));
      terrain.positions[i * 3] = x;
      terrain.positions[i * 3 + 1] = f.pos[1] + rise + Math.abs(gaussian(rand)) * t.surfaceLift;
      terrain.positions[i * 3 + 2] = z;
      break;
    }
  }

  // Height fog over the road and the terrain beside it.
  const fog = cloud(counts.fog, rand);
  for (let i = 0; i < fog.count; i++) {
    const d = from + rand() * span;
    place(fog, i, track, d, gaussian(rand) * t.fogSpread, t.fogBase + rand() * t.fogHeight);
  }

  // Shuffled so drawing any prefix gives an even thinning (adaptive density).
  for (const c of [road, edge, terrain, fog]) shuffle(c, rand);
  return { road, edge, terrain, fog };
}

/** Horizontal distance to the nearest point of the track, from a coarse grid. */
function distanceField(track: Track, from: number, span: number, reach: number) {
  const samples: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let d = from; d < from + span; d += 2) {
    const p = track.frame(d).pos;
    samples.push(p[0], p[2]);
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const cell = 6;
  const x0 = minX - reach;
  const z0 = minZ - reach;
  const nx = Math.ceil((maxX - minX + 2 * reach) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ + 2 * reach) / cell) + 1;
  const field = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      let best = Infinity;
      for (let s = 0; s < samples.length; s += 2) {
        const dd = (samples[s] - x) ** 2 + (samples[s + 1] - z) ** 2;
        if (dd < best) best = dd;
      }
      field[j * nx + i] = Math.sqrt(best);
    }
  }
  return (x: number, z: number) => {
    const fx = Math.min(Math.max((x - x0) / cell, 0), nx - 1.001);
    const fz = Math.min(Math.max((z - z0) / cell, 0), nz - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = field[j * nx + i] + (field[j * nx + i + 1] - field[j * nx + i]) * u;
    const b = field[(j + 1) * nx + i] + (field[(j + 1) * nx + i + 1] - field[(j + 1) * nx + i]) * u;
    return a + (b - a) * v;
  };
}

/** Fisher–Yates over whole particles (positions, seeds and any extra per-particle data). */
function shuffle(c: Cloud & { frames?: Float32Array }, rand: () => number) {
  const swap = (arr: Float32Array, size: number, a: number, b: number) => {
    for (let k = 0; k < size; k++) {
      const tmp = arr[a * size + k];
      arr[a * size + k] = arr[b * size + k];
      arr[b * size + k] = tmp;
    }
  };
  for (let i = c.count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    swap(c.positions, 3, i, j);
    swap(c.seeds, 4, i, j);
    if (c.frames) swap(c.frames, 4, i, j);
  }
}

/** Sparse sharp points on a dome; drawn relative to the camera so they sit at infinity. */
export function buildStars(count: number, t: SceneTuning["track"]): Cloud {
  const rand = random(36);
  const stars = cloud(count, rand);
  for (let i = 0; i < count; i++) {
    const y = t.starHorizon + rand() * (1 - t.starHorizon);
    const r = Math.sqrt(1 - y * y);
    const a = rand() * Math.PI * 2;
    stars.positions[i * 3] = Math.cos(a) * r * t.starRadius;
    stars.positions[i * 3 + 1] = y * t.starRadius;
    stars.positions[i * 3 + 2] = Math.sin(a) * r * t.starRadius;
  }
  return stars;
}

/** Smoke particles carry (birth along the slide, wheel 0/1, unused) instead of a position. */
export function buildSmoke(count: number, emit: readonly [number, number]): Cloud {
  const rand = random(8);
  const smoke = cloud(count, rand);
  for (let i = 0; i < count; i++) {
    smoke.positions[i * 3] = emit[0] + ((i + rand()) / count) * (emit[1] - emit[0]);
    smoke.positions[i * 3 + 1] = i % 2;
  }
  shuffle(smoke, rand);
  return smoke;
}

export type ModelBounds = { min: [number, number, number]; max: [number, number, number] };

/** Model points with their surface frame: normal xyz and how sharply the surface bends (0..1). */
export type ModelCloud = Cloud & { frames: Float32Array; spacing: number };

type V3 = [number, number, number];
const cross3 = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/**
 * Normal and surface variation of every point from its nearest neighbours (local PCA):
 * the normal is the direction of least spread, and the variation λmin / Σλ is high on edges,
 * creases and rims and near zero on flat panels.
 */
function analyse(raw: Float32Array, total: number, bounds: ModelBounds, neighbours: number) {
  const size = [0, 1, 2].map((k) => bounds.max[k] - bounds.min[k]);
  const area = 2 * (size[0] * size[1] + size[1] * size[2] + size[2] * size[0]);
  const cell = Math.sqrt(area / total) * 2.5;
  const dims = size.map((s) => Math.max(1, Math.ceil(s / cell) + 1));
  const coord = (v: number, k: number) => Math.min(dims[k] - 1, Math.floor((v - bounds.min[k]) / cell));

  // Counting sort of points into grid cells.
  const cells = dims[0] * dims[1] * dims[2];
  const start = new Uint32Array(cells + 1);
  const home = new Uint32Array(total);
  for (let i = 0; i < total; i++) {
    home[i] =
      coord(raw[i * 3], 0) + dims[0] * (coord(raw[i * 3 + 1], 1) + dims[1] * coord(raw[i * 3 + 2], 2));
    start[home[i] + 1]++;
  }
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];
  const fill = start.slice(0, cells);
  const sorted = new Uint32Array(total);
  for (let i = 0; i < total; i++) sorted[fill[home[i]]++] = i;

  const normals = new Float32Array(total * 3);
  const variation = new Float32Array(total);
  let spacingSum = 0;
  let spacingCount = 0;
  const bestD = new Float64Array(neighbours);
  const bestI = new Int32Array(neighbours);

  for (let i = 0; i < total; i++) {
    const px = raw[i * 3];
    const py = raw[i * 3 + 1];
    const pz = raw[i * 3 + 2];
    const cx = coord(px, 0);
    const cy = coord(py, 1);
    const cz = coord(pz, 2);

    // k nearest neighbours from the 27 surrounding cells, kept sorted by distance.
    let found = 0;
    for (let z = Math.max(0, cz - 1); z <= Math.min(dims[2] - 1, cz + 1); z++) {
      for (let y = Math.max(0, cy - 1); y <= Math.min(dims[1] - 1, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(dims[0] - 1, cx + 1); x++) {
          const c = x + dims[0] * (y + dims[1] * z);
          for (let s = start[c]; s < start[c + 1]; s++) {
            const j = sorted[s];
            if (j === i) continue;
            const dd = (raw[j * 3] - px) ** 2 + (raw[j * 3 + 1] - py) ** 2 + (raw[j * 3 + 2] - pz) ** 2;
            if (found === neighbours && dd >= bestD[neighbours - 1]) continue;
            let k = found < neighbours ? found++ : neighbours - 1;
            while (k > 0 && bestD[k - 1] > dd) {
              bestD[k] = bestD[k - 1];
              bestI[k] = bestI[k - 1];
              k--;
            }
            bestD[k] = dd;
            bestI[k] = j;
          }
        }
      }
    }
    normals[i * 3 + 1] = 1;
    if (found < 3) continue;

    // Covariance of the point and its neighbours.
    let mx = px;
    let my = py;
    let mz = pz;
    for (let k = 0; k < found; k++) {
      mx += raw[bestI[k] * 3];
      my += raw[bestI[k] * 3 + 1];
      mz += raw[bestI[k] * 3 + 2];
      spacingSum += Math.sqrt(bestD[k]);
    }
    spacingCount += found;
    mx /= found + 1;
    my /= found + 1;
    mz /= found + 1;
    let a00 = 0;
    let a01 = 0;
    let a02 = 0;
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    for (let k = -1; k < found; k++) {
      const j = k < 0 ? i : bestI[k];
      const dx = raw[j * 3] - mx;
      const dy = raw[j * 3 + 1] - my;
      const dz = raw[j * 3 + 2] - mz;
      a00 += dx * dx;
      a01 += dx * dy;
      a02 += dx * dz;
      a11 += dy * dy;
      a12 += dy * dz;
      a22 += dz * dz;
    }

    // Smallest eigenvalue of the symmetric 3×3 (trigonometric solution) and its eigenvector.
    const q = (a00 + a11 + a22) / 3;
    const p1 = a01 * a01 + a02 * a02 + a12 * a12;
    const p = Math.sqrt(((a00 - q) ** 2 + (a11 - q) ** 2 + (a22 - q) ** 2 + 2 * p1) / 6);
    if (p < 1e-12 || q <= 0) continue;
    const b00 = (a00 - q) / p;
    const b11 = (a11 - q) / p;
    const b22 = (a22 - q) / p;
    const b01 = a01 / p;
    const b02 = a02 / p;
    const b12 = a12 / p;
    const det = b00 * (b11 * b22 - b12 * b12) - b01 * (b01 * b22 - b12 * b02) + b02 * (b01 * b12 - b11 * b02);
    const phi = Math.acos(Math.min(1, Math.max(-1, det / 2))) / 3;
    const lmin = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
    variation[i] = Math.max(0, lmin) / (3 * q);

    const r0: V3 = [a00 - lmin, a01, a02];
    const r1: V3 = [a01, a11 - lmin, a12];
    const r2: V3 = [a02, a12, a22 - lmin];
    let n = cross3(r0, r1);
    for (const c of [cross3(r0, r2), cross3(r1, r2)]) {
      if (Math.hypot(...c) > Math.hypot(...n)) n = c;
    }
    const len = Math.hypot(...n) || 1;
    normals.set([n[0] / len, n[1] / len, n[2] / len], i * 3);
  }

  return { normals, variation, spacing: spacingCount ? spacingSum / spacingCount : cell / 2.5 };
}

/**
 * The car's instance data: every model point (or a random share on small budgets), plus
 * extra entries drawn from the most bent places so edges and creases read brighter.
 */
export function sampleModel(
  raw: Float32Array,
  entries: number,
  car: { neighbours: number; edgeExtra: number },
): { cloud: ModelCloud; bounds: ModelBounds } {
  const total = Math.floor(raw.length / 3);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < total; i++) {
    for (let k = 0; k < 3; k++) {
      const v = raw[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const bounds = { min, max };
  const { normals, variation, spacing } = analyse(raw, total, bounds, car.neighbours);

  const rand = random(15);
  const extras = Math.round(entries * car.edgeExtra);
  const base = Math.min(total, entries - extras);
  const order = new Uint32Array(total);
  for (let i = 0; i < total; i++) order[i] = i;
  for (let i = 0; i < base; i++) {
    const j = i + Math.floor(rand() * (total - i));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  // Extra entries come from the most bent quarter of the model.
  const byBend = Array.from(order).sort((a, b) => variation[b] - variation[a]);
  const pool = byBend.slice(0, Math.max(1, Math.floor(total * 0.25)));
  const ceiling = variation[byBend[Math.floor(total * 0.1)]] || 1;

  const count = base + extras;
  const seeded = cloud(count, rand);
  const result: ModelCloud = { ...seeded, frames: new Float32Array(count * 4), spacing };
  for (let e = 0; e < count; e++) {
    const i = e < base ? order[e] : pool[Math.floor(rand() * pool.length)];
    result.positions.set([raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]], e * 3);
    result.frames.set(
      [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2], Math.min(1, variation[i] / ceiling)],
      e * 4,
    );
  }
  shuffle(result, rand);
  return { cloud: result, bounds };
}
