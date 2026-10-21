import { sceneTuning, type SceneTuning } from "@/lib/scene-tuning";
import { add, clamp, DEG, hexToLinear, length, lerp, mix, scale, smoothstep, sub, type Vec3 } from "./math";
import { buildTimeline, type Timeline } from "./timeline";
import { buildTrack, type Track } from "./track";

export type Ride = { tuning: SceneTuning; track: Track; timeline: Timeline };

let cached: Ride | null = null;

/** The track and its scroll timeline, built once per thread. */
export function getRide(): Ride {
  if (!cached) {
    const track = buildTrack(sceneTuning.track);
    cached = { tuning: sceneTuning, track, timeline: buildTimeline(track, sceneTuning) };
  }
  return cached;
}

export type CarPose = {
  /** Track distance and lateral offset of the body centre. */
  d: number;
  u: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** 1 = assembled, 0 = fully dissolved (before the intro is applied). */
  form: number;
  /** Progress through the slide: 0 before it, 1 at its end, beyond 1 as the ride moves on (smoke keeps ageing). */
  slide: number;
};

const ease = (t: number) => smoothstep(0, 1, t);

/** Pose during the slide through the drift corner; also samples the smoke emitters. */
export function slidePose(ride: Ride, t: number) {
  const { track, tuning } = ride;
  const c = tuning.car;
  const stop = track.stops[0];
  // A left-hander has its outside on the right; the nose points into the corner.
  const outside = stop.turn === 0 ? 1 : -stop.turn;
  const yawSign = -stop.turn || 1;

  const d = lerp(stop.distance - c.entry, stop.distance + c.exit, 0.8 * t + 0.2 * ease(t));
  const u = outside * c.lane * (1 - 2 * Math.sin(Math.PI * t) ** 2);
  const slip =
    c.maxSlip * smoothstep(0.08, 0.32, t) * (1 - smoothstep(0.72, 1, t)) -
    c.flick * Math.sin(Math.PI * clamp(t / 0.16, 0, 1));
  return {
    d,
    u,
    yaw: track.yaw(d) + yawSign * slip * DEG,
    pitch: 0,
    roll: outside * c.roll * DEG * clamp(slip / c.maxSlip, 0, 1),
  };
}

export function carPose(ride: Ride, p: number): CarPose {
  const { track, timeline, tuning } = ride;
  const c = tuning.car;
  const { phase } = timeline.phaseAt(p);
  const stop = track.stops[0];
  const outside = stop.turn === 0 ? 1 : -stop.turn;
  const camera = timeline.distanceAt(p);
  // The slide runs while the camera covers the car's path through the corner, so it slows down
  // with the camera at the stop and the car holds its widest angle there.
  const [start, end] = slideWindow(ride);
  const launchFrom = timeline.phases[0].d1;

  if (phase.kind === "hero") {
    const d = c.heroDistance;
    return { d, u: c.heroLateral, yaw: track.yaw(d) + c.heroYaw * DEG, pitch: 0, roll: 0, form: 1, slide: 0 };
  }

  if (camera < start) {
    // Launch: the car pulls ahead of the camera and swings to the outside for the entry.
    const local = clamp((camera - launchFrom) / (start - launchFrom), 0, 1);
    const s = ease(Math.pow(local, 0.8));
    const d = lerp(c.heroDistance, stop.distance - c.entry, s);
    const u = lerp(c.heroLateral, outside * c.lane, ease(local));
    const squat = c.squat * DEG * Math.sin(Math.PI * clamp(local / 0.35, 0, 1));
    const straighten = 1 - ease(clamp(local / 0.4, 0, 1));
    return { d, u, yaw: track.yaw(d) + c.heroYaw * DEG * straighten, pitch: squat, roll: 0, form: 1, slide: 0 };
  }

  if (camera <= end) {
    const local = (camera - start) / (end - start);
    return { ...slidePose(ride, local), form: 1, slide: local };
  }

  // After the slide: straighten up, run away from the camera and dissolve.
  const exit = slidePose(ride, 1);
  const gone = camera - end;
  const d = exit.d + gone * c.runAway;
  const settle = smoothstep(0, 12, gone);
  return {
    d,
    u: lerp(exit.u, 0, settle),
    yaw: lerp(exit.yaw, track.yaw(d), settle),
    pitch: 0,
    roll: lerp(exit.roll, 0, settle),
    form: 1 - smoothstep(c.dissolve[0], c.dissolve[1], d - camera),
    slide: 1 + gone / (end - start),
  };
}

/** Camera distances over which the car slides through the drift corner (its entry to its exit). */
export function slideWindow(ride: Ride): [number, number] {
  const apex = ride.track.stops[0].distance;
  return [apex - ride.tuning.car.entry, apex + ride.tuning.car.exit];
}

/** World position of the body centre on the road surface (before lifting by the model's floor). */
export function carPosition(ride: Ride, pose: { d: number; u: number }): Vec3 {
  const f = ride.track.frame(pose.d);
  return add(f.pos, scale(f.side, pose.u));
}

/** `focus`: depth-of-field focus distance (on the vehicle at stops, on the road ahead between them). */
export type CameraPose = { eye: Vec3; target: Vec3; distance: number; focus: number };

/** Where the drift car is: lifted body centre plus its place on the track. */
export type CarMark = { centre: Vec3; d: number; u: number };

/**
 * Camera on the track, blending into each stop's framing. At the drift stop it chases the car:
 * level with it on the inside of the corner, low, so the slide reads as a silhouette.
 */
export function cameraPose(ride: Ride, p: number, car: CarMark | null): CameraPose {
  const { track, timeline, tuning } = ride;
  const cam = tuning.camera;
  const d = timeline.distanceAt(p);
  const f = track.frame(d);
  const ahead = track.frame(d + cam.lookAhead);

  let side: number = cam.lateral;
  let height: number = cam.height;
  let target: Vec3 = [ahead.pos[0], ahead.pos[1] + cam.targetHeight, ahead.pos[2]];
  let chase: { eye: Vec3; w: number } | null = null;
  // What the lens holds sharp at the strongest nearby stop: the vehicle, or the apex until there is one.
  let subject: { pos: Vec3; w: number } | null = null;

  track.stops.forEach((stop, i) => {
    const config = tuning.stops[stop.id];
    const view = config.view;
    // The chase holds for the whole slide; other stops hold for their crawl.
    const [from, to] = "chase" in config ? slideWindow(ride) : [timeline.stopCameras[i], timeline.stopCameras[i]];
    const half = "chase" in config ? (to - from) / 2 : timeline.stopHalves[i];
    const centre = (from + to) / 2;
    const w = 1 - smoothstep(half, half + tuning.scroll.stopBlend, Math.abs(d - centre));
    if (w <= 0) return;
    const outside = stop.turn === 0 ? 1 : -stop.turn;
    const held = subject as { pos: Vec3; w: number } | null;
    if (!held || w > held.w) {
      subject = { pos: "chase" in config && car ? car.centre : track.frame(stop.distance).pos, w };
    }
    if ("chase" in config && car) {
      const c = config.chase;
      const at = track.frame(car.d + c.ahead);
      const eye = add(at.pos, scale(at.side, car.u - outside * c.inside));
      eye[1] += c.height;
      chase = { eye, w };
      target = mix(target, add(car.centre, [0, c.aim, 0]), w * view.look);
      return;
    }
    side = lerp(side, outside * view.side, w);
    height = lerp(height, view.height, w);
    // Stops without a body yet frame their apex.
    target = mix(target, add(track.frame(stop.distance).pos, [0, cam.targetHeight, 0]), w * view.look);
  });

  let eye = add(add(f.pos, scale(f.side, side)), [0, height, 0]);
  const chased = chase as { eye: Vec3; w: number } | null;
  if (chased) eye = mix(eye, chased.eye, chased.w);
  const held = subject as { pos: Vec3; w: number } | null;
  const focus = held ? lerp(tuning.dof.roadFocus, length(sub(held.pos, eye)), held.w) : tuning.dof.roadFocus;
  return { eye, target, distance: d, focus };
}

const palettes = {
  colour: Object.values(sceneTuning.stops).map((s) => hexToLinear(s.colour)),
  ground: Object.values(sceneTuning.stops).map((s) => hexToLinear(s.ground)),
};

/**
 * Chapter colour (linear RGB), or with `palette = "ground"` the terrain colour that goes with it:
 * holds at a stop, blends during the travel into the next.
 */
export function chapterColour(ride: Ride, p: number, palette: keyof typeof palettes = "colour"): Vec3 {
  const { phase, local } = ride.timeline.phaseAt(p);
  const ids = ride.track.stops.map((s) => Object.keys(ride.tuning.stops).indexOf(s.id));
  const colourOf = (stop: number) => palettes[palette][ids[clamp(stop, 0, ids.length - 1)]];
  if (phase.kind === "hero") return colourOf(0);
  if (phase.kind === "tail") return colourOf(ids.length - 1);
  if (phase.kind === "dwell" || phase.stop === 0) return colourOf(phase.stop);
  return mix(colourOf(phase.stop - 1), colourOf(phase.stop), smoothstep(0.2, 0.8, local));
}

/** Snaps progress to the nearest still frame (opening view or a stop) for reduced motion. */
export function stillFrame(ride: Ride, p: number) {
  const frames = [0, ...ride.timeline.stopCentres];
  return frames.reduce((best, f) => (Math.abs(f - p) < Math.abs(best - p) ? f : best), 0);
}
