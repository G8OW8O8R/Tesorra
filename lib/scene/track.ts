import type { SceneTuning, StopId } from "@/lib/scene-tuning";
import { DEG, normalize, sub, type Vec3 } from "./math";

type Segment = SceneTuning["track"]["segments"][number];

export type TrackStop = {
  id: StopId;
  /** Arc-length distance of the apex. */
  distance: number;
  /** +1 for a right-hander, −1 for a left-hander, 0 on a straight. */
  turn: number;
};

export type TrackFrame = {
  pos: Vec3;
  tangent: Vec3;
  /** Horizontal unit vector to the right of the direction of travel. */
  side: Vec3;
};

export type Track = {
  length: number;
  stops: TrackStop[];
  frame(d: number): TrackFrame;
  /** Yaw of a +X-forward body pointing along the track. */
  yaw(d: number): number;
  /** Signed heading change per metre (+ = turning right). */
  curvature(d: number): number;
};

/** Walks the segment list and drops control points along it (heading 0 = −Z, + = right). */
function controlPoints(t: SceneTuning["track"]) {
  const points: Vec3[] = [[0, 0, 0]];
  const apexes: { id: StopId; pos: Vec3; turn: number }[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  let heading = 0;

  for (const seg of t.segments as readonly Segment[]) {
    const rise = "rise" in seg ? (seg.rise ?? 0) : 0;
    if ("straight" in seg) {
      const steps = Math.max(1, Math.round(seg.straight / t.straightStep));
      for (let i = 1; i <= steps; i++) {
        const l = seg.straight / steps;
        x += Math.sin(heading) * l;
        z -= Math.cos(heading) * l;
        y += rise / steps;
        points.push([x, y, z]);
        if ("stop" in seg && seg.stop && i === Math.ceil(steps / 2)) {
          // Midpoint of the straight, interpolated back from this control point.
          const back = (i - steps / 2) * l;
          apexes.push({
            id: seg.stop,
            pos: [x - Math.sin(heading) * back, y, z + Math.cos(heading) * back],
            turn: 0,
          });
        }
      }
    } else {
      const angle = seg.turn * DEG;
      const arc = Math.abs(angle) * seg.radius;
      const steps = Math.max(2, Math.round(arc / t.turnStep));
      for (let i = 1; i <= steps; i++) {
        const l = arc / steps;
        // Midpoint rule keeps the polyline on the arc.
        const h = heading + (angle / steps) * 0.5;
        x += Math.sin(h) * l;
        z -= Math.cos(h) * l;
        y += rise / steps;
        heading += angle / steps;
        points.push([x, y, z]);
      }
      if ("stop" in seg && seg.stop) {
        const mid = points[points.length - 1 - Math.floor(steps / 2)];
        apexes.push({ id: seg.stop, pos: mid, turn: Math.sign(seg.turn) });
      }
    }
  }
  return { points, apexes };
}

/** Centripetal Catmull-Rom between p1 and p2 (no cusps or self-loops on uneven spacing). */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const knot = (a: Vec3, b: Vec3) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) || 1e-4;
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a1 = ((t1 - u) / (t1 - t0)) * p0[k] + ((u - t0) / (t1 - t0)) * p1[k];
    const a2 = ((t2 - u) / (t2 - t1)) * p1[k] + ((u - t1) / (t2 - t1)) * p2[k];
    const a3 = ((t3 - u) / (t3 - t2)) * p2[k] + ((u - t2) / (t3 - t2)) * p3[k];
    const b1 = ((t2 - u) / (t2 - t0)) * a1 + ((u - t0) / (t2 - t0)) * a2;
    const b2 = ((t3 - u) / (t3 - t1)) * a2 + ((u - t1) / (t3 - t1)) * a3;
    out[k] = ((t2 - u) / (t2 - t1)) * b1 + ((u - t1) / (t2 - t1)) * b2;
  }
  return out;
}

const STEP = 0.25;
const SUBDIVISIONS = 24;

export function buildTrack(t: SceneTuning["track"]): Track {
  const { points, apexes } = controlPoints(t);
  const n = points.length;
  const at = (i: number): Vec3 => {
    if (i < 0) return sub([points[0][0] * 2, points[0][1] * 2, points[0][2] * 2], points[1]);
    if (i >= n) return sub([points[n - 1][0] * 2, points[n - 1][1] * 2, points[n - 1][2] * 2], points[n - 2]);
    return points[i];
  };

  // Dense spline samples with cumulative arc length.
  const dense: Vec3[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < SUBDIVISIONS; s++) {
      dense.push(catmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), s / SUBDIVISIONS));
    }
  }
  dense.push(points[n - 1]);
  const cumulative = [0];
  for (let i = 1; i < dense.length; i++) {
    const [a, b] = [dense[i - 1], dense[i]];
    cumulative.push(cumulative[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const length = cumulative[cumulative.length - 1];

  // Resample at a fixed arc-length step so lookups are O(1).
  const count = Math.floor(length / STEP) + 1;
  const pos = new Float64Array(count * 3);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = i * STEP;
    while (j < cumulative.length - 2 && cumulative[j + 1] < d) j++;
    const f = (d - cumulative[j]) / (cumulative[j + 1] - cumulative[j] || 1);
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = dense[j][k] + (dense[j + 1][k] - dense[j][k]) * f;
  }
  const tan = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    const v = normalize([pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]]);
    tan.set(v, i * 3);
  }

  const read = (arr: Float64Array, i: number): Vec3 => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];

  function frame(d: number): TrackFrame {
    let p: Vec3;
    let tg: Vec3;
    if (d <= 0) {
      tg = read(tan, 0);
      const p0 = read(pos, 0);
      p = [p0[0] + tg[0] * d, p0[1] + tg[1] * d, p0[2] + tg[2] * d];
    } else if (d >= (count - 1) * STEP) {
      tg = read(tan, count - 1);
      const p1 = read(pos, count - 1);
      const over = d - (count - 1) * STEP;
      p = [p1[0] + tg[0] * over, p1[1] + tg[1] * over, p1[2] + tg[2] * over];
    } else {
      const x = d / STEP;
      const i = Math.floor(x);
      const f = x - i;
      const a = read(pos, i);
      const b = read(pos, i + 1);
      const ta = read(tan, i);
      const tb = read(tan, i + 1);
      p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      tg = normalize([ta[0] + (tb[0] - ta[0]) * f, ta[1] + (tb[1] - ta[1]) * f, ta[2] + (tb[2] - ta[2]) * f]);
    }
    return { pos: p, tangent: tg, side: normalize([-tg[2], 0, tg[0]]) };
  }

  const heading = (d: number) => {
    const tg = frame(d).tangent;
    return Math.atan2(tg[0], -tg[2]);
  };

  function curvature(d: number) {
    const h = 1.5;
    let delta = heading(d + h) - heading(d - h);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    return delta / (2 * h);
  }

  function nearest(p: Vec3) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const dd = (pos[i * 3] - p[0]) ** 2 + (pos[i * 3 + 1] - p[1]) ** 2 + (pos[i * 3 + 2] - p[2]) ** 2;
      if (dd < bestDist) {
        bestDist = dd;
        best = i;
      }
    }
    return best * STEP;
  }

  return {
    length,
    stops: apexes.map((a) => ({ id: a.id, distance: nearest(a.pos), turn: a.turn })),
    frame,
    yaw: (d) => {
      const tg = frame(d).tangent;
      return Math.atan2(-tg[2], tg[0]);
    },
    curvature,
  };
}
