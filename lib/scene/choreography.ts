import { sceneTuning, type BodyId, type SceneTuning, type StopId } from "@/lib/scene-tuning";
import { add, clamp, DEG, hexToLinear, length, lerp, mix, normalize, scale, smoothstep, sub, type Vec3 } from "./math";
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
    // Never let the camera catch up: the car keeps at least its parked lead, shrinking to nothing
    // by the slide, where the camera rides level with it.
    const d = Math.max(lerp(c.heroDistance, stop.distance - c.entry, s), camera + (c.heroDistance - launchFrom) * (1 - local));
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

/**
 * The car's entrance into the opening view, `k` from 0 (off to the right) to 1 (parked): what to add
 * to its pose. It slides in sideways and brakes, the extra slip unwinding a little later.
 */
export function entranceOffset(ride: Ride, k: number) {
  const [d, u, slip] = ride.tuning.car.drive.from;
  const left = 1 - clamp(k, 0, 1);
  const travel = left * left * left;
  return { d: d * travel, u: u * travel, yaw: slip * DEG * left * left };
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

/**
 * `focus`: depth-of-field focus distance (on the vehicle at stops, on the road ahead between them);
 * `hold`: how fully a stop's framing has taken over (0 riding, 1 held at a stop);
 * `hero`: how fully the opening view's camera still holds (1 before the ride sets off);
 * `lens`: shift of the picture on portrait screens (NDC x, y; + = right, up);
 * `minFov`: the narrowest horizontal field of view there (degrees).
 */
export type CameraPose = {
  eye: Vec3;
  target: Vec3;
  distance: number;
  focus: number;
  hold: number;
  hero: number;
  lens: [number, number];
  minFov: number;
};

/** Where a stop's vehicle is: lifted body centre plus its place on the track. */
export type CarMark = { centre: Vec3; d: number; u: number };
/** The vehicles the camera frames, by the stop they belong to. */
export type Marks = Partial<Record<StopId, CarMark>>;

/** Camera distances over which a stop's framing holds fully (the drift chase holds for the slide). */
export function holdWindow(ride: Ride, i: number): [number, number] {
  const config = ride.tuning.stops[ride.track.stops[i].id];
  if (!("hold" in config)) return slideWindow(ride);
  const camera = ride.timeline.stopCameras[i];
  const [from, to] = config.hold;
  return [camera + from, camera + to];
}

/**
 * A stop's own framing at camera distance d. Chase stops ride level with their vehicle on the
 * inside of the corner, low, so it reads as a silhouette; shot stops stand by the track and
 * turn after their vehicle as it goes by.
 */
function stopShot(ride: Ride, i: number, d: number, mark: CarMark | null) {
  const { track, timeline, tuning } = ride;
  const stop = track.stops[i];
  const config = tuning.stops[stop.id];
  const outside = stop.turn === 0 ? 1 : -stop.turn;
  const inside = stop.turn || 1;
  if ("chase" in config && mark) {
    const c = config.chase;
    const at = track.frame(mark.d + c.ahead);
    const eye = add(at.pos, scale(at.side, mark.u - outside * c.inside));
    eye[1] += c.height;
    return { eye, target: add(mark.centre, [0, c.aim, 0]), look: config.view.look, subject: mark.centre };
  }
  if ("shot" in config) {
    const s = config.shot;
    const camera = timeline.stopCameras[i];
    const place = (along: number, u: number, height: number): Vec3 => {
      const f = track.frame(along);
      return add(add(f.pos, scale(f.side, u)), [0, height, 0]);
    };
    const eyeAt = camera + s.eye[0] + s.creep * (d - camera);
    const eye = place(eyeAt, inside * s.eye[1], s.eye[2]);
    let target = place(camera + s.aim[0], inside * s.aim[1], s.aim[2]);
    let subject = target;
    if (mark && s.follow > 0) {
      // Never aim behind the lens: a car still coming up from behind is followed from just ahead.
      const lift = mark.centre[1] - track.frame(mark.d).pos[1];
      const seen = mark.d < eyeAt + 1.5 ? place(eyeAt + 1.5, mark.u, lift) : mark.centre;
      target = mix(target, seen, s.follow);
      subject = mark.centre;
    }
    return { eye, target, look: config.view.look, subject };
  }
  // A chase stop whose vehicle is not there: ride on and frame the apex.
  const f = track.frame(d);
  const apex = add(track.frame(stop.distance).pos, [0, tuning.camera.targetHeight, 0]);
  const eye = add(add(f.pos, scale(f.side, tuning.camera.lateral)), [0, tuning.camera.height, 0]);
  return { eye, target: apex, look: config.view.look, subject: apex };
}

/**
 * Camera on the track, blending into each stop's framing around its hold. `portrait` (0..1)
 * switches to the stop's own framing for phones held upright (`tuning.portrait`): the camera
 * backs off what the stop frames, the field of view and the lens shift set the vehicle in the
 * scene above the text.
 */
export function cameraPose(ride: Ride, p: number, marks: Marks = {}, portrait = 0): CameraPose {
  const { track, timeline, tuning } = ride;
  const cam = tuning.camera;
  const d = timeline.distanceAt(p);
  const f = track.frame(d);
  const ahead = track.frame(d + cam.lookAhead);
  // The opening view sits lower and nearer level, and eases into the ride's camera as it sets off.
  const h = tuning.hero;
  const hero = 1 - smoothstep(tuning.scroll.heroDistance, tuning.scroll.heroDistance + h.blend, d);
  const lateral = lerp(cam.lateral, lerp(h.lateral, h.portraitLateral, portrait), hero);

  let eye = add(add(f.pos, scale(f.side, lateral)), [0, lerp(cam.height, h.height, hero), 0]);
  let target: Vec3 = [ahead.pos[0], ahead.pos[1] + lerp(cam.targetHeight, h.targetHeight, hero), ahead.pos[2]];
  // What the lens holds sharp at the strongest nearby stop.
  let subject: { pos: Vec3; w: number; stop: StopId } | null = null;

  for (let i = 0; i < track.stops.length; i++) {
    const [from, to] = holdWindow(ride, i);
    const half = Math.max((to - from) / 2, timeline.stopHalves[i]);
    const w = 1 - smoothstep(half, half + tuning.scroll.stopBlend, Math.abs(d - (from + to) / 2));
    if (w <= 0) continue;
    const shot = stopShot(ride, i, d, marks[track.stops[i].id] ?? null);
    eye = mix(eye, shot.eye, w);
    target = mix(target, shot.target, w * shot.look);
    if (!subject || w > subject.w) subject = { pos: shot.subject, w, stop: track.stops[i].id };
  }

  const hold = subject ? subject.w : 0;
  const fit = subject ? tuning.portrait[subject.stop] : null;
  const k = portrait * hold;
  if (fit && k > 0) eye = add(target, scale(sub(eye, target), 1 + (fit.pull - 1) * k));
  const lens: [number, number] = [
    fit ? fit.shift[0] * k : 0,
    (fit ? fit.shift[1] * k : 0) + h.portraitShift * hero * portrait,
  ];
  const minFov = lerp(fit ? lerp(cam.minHorizontalFov, fit.fov, k) : cam.minHorizontalFov, h.portraitFov, hero * portrait);
  const focus = subject ? lerp(tuning.dof.roadFocus, length(sub(subject.pos, eye)), subject.w) : tuning.dof.roadFocus;
  return { eye, target, distance: d, focus, hold, hero, lens, minFov };
}

/**
 * Vertical field of view (radians) for a screen of this aspect, widened by `kick` degrees; the
 * horizontal one never drops below `minFov` degrees (the view's own, on portrait screens).
 */
export function fieldOfView(ride: Ride, aspect: number, kick = 0, minFov: number = ride.tuning.camera.minHorizontalFov) {
  const cam = ride.tuning.camera;
  const minVertical = 2 * Math.atan(Math.tan((minFov * DEG) / 2) / aspect);
  return Math.max((cam.fov + kick) * DEG, minVertical + kick * DEG);
}

/** How far towards portrait a screen of this aspect is (0 landscape, 1 portrait). */
export function portraitOf(aspect: number) {
  return clamp((1 - aspect) / 0.25, 0, 1);
}

/**
 * Where the horizon crosses a screen of this aspect in the opening view (NDC y, +1 at the top):
 * the page stands the wordmark on it.
 */
export function heroHorizon(ride: Ride, aspect: number) {
  const portrait = portraitOf(aspect);
  const view = cameraPose(ride, 0, {}, portrait);
  const dir = normalize(sub(view.target, view.eye));
  // A level ray ahead sits as far above the middle of the picture as the camera looks down.
  const down = -Math.asin(clamp(dir[1], -1, 1));
  return Math.tan(down) / Math.tan(fieldOfView(ride, aspect, 0, view.minFov) / 2) + view.lens[1];
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

/** Pose of any dust body: place on the track, rotation, assembly (0..1) and its run progress. */
export type BodyPose = CarPose & {
  /** Rotate about the tyre contact instead of the body centre (a leaning bike). */
  pivot?: "ground";
};

function stopIndex(ride: Ride, id: StopId) {
  return ride.track.stops.findIndex((s) => s.id === id);
}

/** Chapters from the middle of a stop (negative before it). */
export function chapterOffset(ride: Ride, p: number, id: StopId) {
  return (p - ride.timeline.stopCentres[stopIndex(ride, id)]) * ride.timeline.chapters;
}

/** Camera distances of the formula car's hold, the track distances of its run and its pace off the mark. */
function formulaRun(ride: Ride) {
  const f = ride.tuning.formula;
  const i = stopIndex(ride, "formula");
  const [c0, c1] = holdWindow(ride, i);
  const camera = ride.timeline.stopCameras[i];
  const start = camera + f.from;
  const rest = camera + f.rest[0];
  // Metres of track per metre of camera travel as the hold begins, kept for the approach.
  const pace = ((rest - start) * f.power) / (f.brake * (c1 - c0));
  return { stop: ride.track.stops[i], c0, c1, start, rest, pace };
}

/** The formula car at run progress t: flat out past the lens, braking hard, standing from `brake` on. */
export function formulaAt(ride: Ride, t: number) {
  const { track, tuning } = ride;
  const f = tuning.formula;
  const run = formulaRun(ride);
  const inside = run.stop.turn || 1;
  const k = clamp(t / f.brake, 0, 1);
  const d = lerp(run.start, run.rest, 1 - Math.pow(1 - k, f.power));
  return {
    d,
    u: inside * lerp(f.lane, f.rest[1], smoothstep(0.3, 1, k)),
    // Positive yaw turns left, so the nose turns in against the corner's sign.
    yaw: track.yaw(d) - inside * f.turnIn * DEG * smoothstep(0.5, 1, k),
    pitch: 0,
    roll: 0,
  };
}

export function formulaPose(ride: Ride, p: number): BodyPose {
  const f = ride.tuning.formula;
  const run = formulaRun(ride);
  const camera = ride.timeline.distanceAt(p);
  const t = (camera - run.c0) / (run.c1 - run.c0);
  if (t < 0) {
    // Coming up flat out from behind the lens, assembling out of sight.
    const d = run.start + (camera - run.c0) * run.pace;
    const form = smoothstep(-f.assemble, 0, t);
    return { ...formulaAt(ride, 0), d, yaw: ride.track.yaw(d), form, slide: t };
  }
  if (t <= 1) return { ...formulaAt(ride, t), form: 1, slide: t };
  // Pulls away from a standstill as the ride moves on, then dissolves.
  const rest = formulaAt(ride, 1);
  const gone = camera - run.c1;
  const d = rest.d + (f.runAway * gone * gone) / (gone + 6);
  const settle = smoothstep(0, 12, gone);
  return {
    d,
    u: lerp(rest.u, 0, settle),
    yaw: lerp(rest.yaw, ride.track.yaw(d), settle),
    pitch: 0,
    roll: 0,
    form: 1 - smoothstep(f.dissolve[0], f.dissolve[1], gone),
    slide: t,
  };
}

function motoRun(ride: Ride) {
  const m = ride.tuning.moto;
  const i = stopIndex(ride, "moto");
  const stop = ride.track.stops[i];
  const [c0, c1] = holdWindow(ride, i);
  const start = stop.distance - m.entry;
  const end = stop.distance + m.exit;
  return { stop, c0, c1, start, end, pace: (end - start) / (c1 - c0) };
}

/** The bike at lean progress t through the moto corner: out-in-out, down to full lean mid-corner. */
export function motoAt(ride: Ride, t: number) {
  const { track, tuning } = ride;
  const m = tuning.moto;
  const run = motoRun(ride);
  const inside = run.stop.turn || 1;
  const k = clamp(t, 0, 1);
  const d = lerp(run.start, run.end, k);
  const lean = m.lean * DEG * smoothstep(0.08, 0.38, k) * (1 - smoothstep(0.62, 0.92, k));
  return {
    d,
    u: -inside * m.lane * (1 - 2 * Math.sin(Math.PI * k) ** 2),
    yaw: track.yaw(d),
    pitch: 0,
    roll: inside * lean,
  };
}

export function motoPose(ride: Ride, p: number): BodyPose {
  const m = ride.tuning.moto;
  const run = motoRun(ride);
  const camera = ride.timeline.distanceAt(p);
  const t = (camera - run.c0) / (run.c1 - run.c0);
  const before = camera - run.c0;
  if (t < 0) {
    // Rides beside the camera at its pace, upright, assembling from the dust.
    const d = run.start + before * run.pace;
    const form = smoothstep(m.assemble[0], m.assemble[1], before);
    return { ...motoAt(ride, 0), d, yaw: ride.track.yaw(d), form, slide: t, pivot: "ground" };
  }
  if (t <= 1) return { ...motoAt(ride, t), form: 1, slide: t, pivot: "ground" };
  const exit = motoAt(ride, 1);
  const gone = camera - run.c1;
  const d = exit.d + gone * m.runAway;
  return {
    d,
    u: lerp(exit.u, 0, smoothstep(0, 12, gone)),
    yaw: ride.track.yaw(d),
    pitch: 0,
    roll: 0,
    form: 1 - smoothstep(m.dissolve[0], m.dissolve[1], d - camera),
    slide: t,
    pivot: "ground",
  };
}

let storeCache: { ride: Ride; eye: Vec3; fwd: Vec3; right: Vec3 } | null = null;

/** The store camera at the middle of its stop, level: the products are set out in front of it. */
function storeView(ride: Ride) {
  if (storeCache?.ride !== ride) {
    const view = cameraPose(ride, ride.timeline.stopCentres[stopIndex(ride, "store")]);
    const fwd = normalize([view.target[0] - view.eye[0], 0, view.target[2] - view.eye[2]]);
    storeCache = { ride, eye: view.eye, fwd, right: [-fwd[2], 0, fwd[0]] };
  }
  return storeCache;
}

/**
 * The floating store products: where each one hangs in the world (before its drift) and how far
 * it has come out of the dust (0 gone, 1 whole).
 */
export function storeProducts(ride: Ride, p: number): { pos: Vec3; form: number }[] {
  const s = ride.tuning.store;
  const q = chapterOffset(ride, p, "store");
  const view = storeView(ride);
  // Spots are given for a 16:9 view at the stop.
  const tanV = Math.tan((ride.tuning.camera.fov * DEG) / 2);
  return s.products.map(({ at: [x, y], depth }, i) => {
    const k = i * s.stagger;
    const form =
      smoothstep(s.appear[0] + k, s.appear[1] + k, q) * (1 - smoothstep(s.vanish[0] + k, s.vanish[1] + k, q));
    const pos = add(
      add(add(view.eye, scale(view.fwd, depth)), scale(view.right, x * depth * tanV * (16 / 9))),
      [0, y * depth * tanV, 0],
    );
    return { pos, form };
  });
}

/** The start gantry over the grid; it only assembles, then stands. */
export function gantryPose(ride: Ride, p: number): BodyPose {
  const { track, tuning } = ride;
  const l = tuning.live;
  const d = track.stops[stopIndex(ride, "live")].distance + l.gantry;
  const form = smoothstep(l.assemble[0], l.assemble[1], chapterOffset(ride, p, "live"));
  return { d, u: 0, yaw: track.yaw(d), pitch: 0, roll: 0, form, slide: 0 };
}

/** Whether the ride is close enough to the live stop for its start lights to run. */
export function nearLive(ride: Ride, p: number) {
  return chapterOffset(ride, p, "live") >= ride.tuning.live.lightsFrom;
}

/**
 * Brightness of the five start lights (0 off … 1 on) `seconds` after the ride came near the live
 * stop: on one by one every `lightStep`, then all five stay lit.
 */
export function startLights(ride: Ride, seconds: number): number[] {
  const step = ride.tuning.live.lightStep;
  return [0, 1, 2, 3, 4].map((i) => clamp((seconds - (i + 1) * step) / 0.05, 0, 1));
}

/** Every dust body's pose at scroll progress p. */
export function bodyPoses(ride: Ride, p: number): Record<BodyId, BodyPose> {
  return {
    car: carPose(ride, p),
    formula: formulaPose(ride, p),
    moto: motoPose(ride, p),
    gantry: gantryPose(ride, p),
  };
}

/** Stop whose chapter is current: the next one takes over halfway through each ride. */
export function chapterAt(ride: Ride, p: number) {
  const { phase, local } = ride.timeline.phaseAt(p);
  if (phase.kind === "hero") return 0;
  if (phase.kind === "tail") return ride.track.stops.length - 1;
  if (phase.kind === "travel" && local < 0.5) return Math.max(0, phase.stop - 1);
  return phase.stop;
}
