import { describe, expect, it } from "vitest";
import {
  bodyPoses,
  cameraPose,
  carPosition,
  fieldOfView,
  getRide,
  heroHorizon,
  portraitOf,
  type BodyPose,
} from "@/lib/scene/choreography";
import {
  bodyMatrix,
  lookAt,
  mat4,
  multiply,
  normalize,
  perspective,
  transformDirection,
  transformPoint,
  type Vec3,
} from "@/lib/scene/math";
import { sceneTuning } from "@/lib/scene-tuning";

const ride = getRide();
const T = sceneTuning;

/** Model bounds of the scanned vehicles (model units); the bike's include its rider. */
const BOUNDS = {
  car: { min: [-1, -0.267, -0.41], max: [1, 0.267, 0.41], scale: T.car.scale },
  formula: { min: [-1, -0.219, -0.359], max: [1, 0.219, 0.359], scale: T.bodies.formula.scale },
  moto: { min: [-1, -0.527, -0.62], max: [1, 0.88, 0.62], scale: T.bodies.moto.scale },
} as const;
type Vehicle = keyof typeof BOUNDS;

/** Model matrix as the engine places the body: on its floor, or about the tyre contact. */
function place(id: Vehicle, pose: BodyPose) {
  const b = BOUNDS[id];
  const floor = -b.min[1] * b.scale;
  const pos = carPosition(ride, pose);
  const m = mat4();
  if (pose.pivot === "ground") {
    bodyMatrix(m, pos, pose.yaw, pose.pitch, pose.roll, b.scale);
    const up = normalize(transformDirection(m, [0, 1, 0]));
    for (let k = 0; k < 3; k++) pos[k] += up[k] * floor;
  } else pos[1] += floor;
  bodyMatrix(m, pos, pose.yaw, pose.pitch, pose.roll, b.scale);
  return { m, centre: pos };
}

/** Screen box (NDC) of a vehicle's bounding box at the middle of a stop. */
function frameAt(id: Vehicle, stop: number, aspect: number, portrait: number) {
  return frameAtProgress(id, ride.timeline.stopCentres[stop], aspect, portrait);
}

/** Screen box (NDC) of a vehicle's bounding box at ride progress p. */
function frameAtProgress(id: Vehicle, p: number, aspect: number, portrait: number) {
  const poses = bodyPoses(ride, p);
  const mark = (v: Vehicle) => ({ centre: place(v, poses[v]).centre, d: poses[v].d, u: poses[v].u });
  const view = cameraPose(ride, p, { drift: mark("car"), formula: mark("formula"), moto: mark("moto") }, portrait);
  const proj = perspective(mat4(), fieldOfView(ride, aspect, 0, view.minFov), aspect, T.camera.near, T.camera.far);
  proj[8] = -view.lens[0];
  proj[9] = -view.lens[1];
  const vp = multiply(mat4(), proj, lookAt(mat4(), view.eye, view.target));
  const { m } = place(id, poses[id]);
  const b = BOUNDS[id];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) {
        const w = transformPoint(m, [x, y, z]);
        const c = [0, 1, 3].map((k) => vp[k] * w[0] + vp[4 + k] * w[1] + vp[8 + k] * w[2] + vp[12 + k]) as Vec3;
        xs.push(c[0] / c[2]);
        ys.push(c[1] / c[2]);
      }
  return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
}

const share = (box: { x: number[] }) => (Math.min(box.x[1], 1) - Math.max(box.x[0], -1)) / 2;
const STOPS: [Vehicle, number][] = [
  ["car", 0],
  ["formula", 1],
  ["moto", 2],
];

describe("vehicle framing", () => {
  it("frames every vehicle about as wide as the drift car on a wide screen", () => {
    for (const [id, stop] of STOPS) {
      const s = share(frameAt(id, stop, 16 / 9, 0));
      expect(s, id).toBeGreaterThan(0.3);
      expect(s, id).toBeLessThan(0.62);
    }
  });

  it("centres every vehicle about 85% wide in the scene above the text on a phone held upright", () => {
    for (const aspect of [390 / 844, 360 / 700]) {
      for (const [id, stop] of STOPS) {
        const box = frameAt(id, stop, aspect, portraitOf(aspect));
        expect(box.x[0], id).toBeGreaterThan(-1);
        expect(box.x[1], id).toBeLessThan(1);
        expect(share(box), id).toBeGreaterThan(0.78);
        expect(Math.abs(box.x[0] + box.x[1]) / 2, id).toBeLessThan(0.05);
        // The scene is the upper 60% of the screen (NDC above -0.2), under the bar.
        expect(box.y[0], id).toBeGreaterThan(-0.2);
        expect(box.y[1], id).toBeLessThan(0.8);
      }
    }
  });
});

describe("opening view", () => {
  it("parks the drift car large in the lower right, its roof up at the horizon", () => {
    const aspect = 16 / 9;
    const box = frameAtProgress("car", 0, aspect, 0);
    const horizon = heroHorizon(ride, aspect);
    expect(share(box)).toBeGreaterThan(0.45);
    expect(share(box)).toBeLessThan(0.62);
    expect((box.x[0] + box.x[1]) / 2).toBeGreaterThan(0.2);
    expect(box.x[1]).toBeLessThan(1.05);
    expect(box.y[0]).toBeLessThan(-0.45);
    // The wordmark's feet sink into the haze at the horizon: the roof reaches up to them.
    expect(Math.abs(box.y[1] - horizon)).toBeLessThan(0.12);
    expect(horizon).toBeGreaterThan(0.1);
    expect(horizon).toBeLessThan(0.3);
  });

  it("keeps the car under the wordmark and in frame on a phone held upright", () => {
    const aspect = 9 / 19.5;
    const box = frameAtProgress("car", 0, aspect, portraitOf(aspect));
    const horizon = heroHorizon(ride, aspect);
    expect(box.x[0]).toBeGreaterThan(-1);
    expect(box.x[1]).toBeLessThan(1);
    expect(box.y[0]).toBeGreaterThan(-0.2);
    expect(share(box)).toBeGreaterThan(0.7);
    expect((box.y[0] + box.y[1]) / 2).toBeLessThan(horizon);
    expect(horizon).toBeGreaterThan(0.1);
  });
});
