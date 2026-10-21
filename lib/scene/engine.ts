import { sceneTuning } from "@/lib/scene-tuning";
import {
  carPose,
  carPosition,
  cameraPose,
  chapterColour,
  getRide,
  slidePose,
  stillFrame,
} from "./choreography";
import {
  createInstances,
  createProgram,
  createTarget,
  deleteTarget,
  pickTargetFormat,
  type Instances,
  type Program,
  type Target,
  type TargetFormat,
} from "./gl";
import {
  bodyMatrix,
  clamp,
  damp,
  DEG,
  hexToLinear,
  hexToRgb,
  invert,
  lookAt,
  mat4,
  multiply,
  normalize,
  perspective,
  sphereInFrustum,
  sub,
  transformDirection,
  transformPoint,
  unproject,
  type Vec3,
} from "./math";
import { createSimulation, resetSimulation, type Simulation } from "./sim";
import { buildSmoke, buildStars, buildTrackClouds, sampleModel, type ModelBounds } from "./particles";
import type { EngineEvent, EngineOptions, PointerState } from "./protocol";
import {
  bodySimFragment,
  bodyVertex,
  ceilingFragment,
  compositeFragment,
  downFragment,
  fullscreenVertex,
  horizonFragment,
  particleFragment,
  prefilterFragment,
  smokeSimFragment,
  smokeVertex,
  staticVertex,
  upFragment,
} from "./shaders";

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Look = (typeof sceneTuning.layers)[keyof typeof sceneTuning.layers];
/** Layers thinned by the adaptive density (the rest are cheap). */
const ADAPTIVE = new Set<string>(["road", "edge", "terrain"]);

const T = sceneTuning;
const STATIC_LAYERS = ["stars", "fog", "terrain", "road", "edge"] as const;
/** Bounds used until the model arrives (or if it never does). */
const FALLBACK_BOUNDS: ModelBounds = { min: [-1, -0.3, -0.42], max: [1, 0.3, 0.42] };

const schedule: (cb: (now: number) => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const unschedule: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

/**
 * Renders the dust world: particles splatted additively into a half-float buffer,
 * soft-threshold bloom over five mips, ACES tone mapping and grain on top of the page colour.
 * Runs unchanged in a worker (OffscreenCanvas) or on the main thread.
 */
export class DustEngine {
  static create(canvas: Surface, options: EngineOptions, emit: (e: EngineEvent) => void) {
    const gl = (canvas as OffscreenCanvas).getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    }) as WebGL2RenderingContext | null;
    if (!gl) {
      emit({ type: "status", status: "unsupported" });
      return null;
    }
    try {
      return new DustEngine(canvas, gl, options, emit);
    } catch (error) {
      emit({ type: "status", status: "error", message: String(error) });
      return null;
    }
  }

  private ride = getRide();
  private format: TargetFormat;
  private particle: { still: Program; body: Program; smoke: Program };
  private simPrograms: { body: Program; smoke: Program };
  private post: {
    prefilter: Program;
    down: Program;
    up: Program;
    composite: Program;
    ceiling: Program;
    horizon: Program;
  };
  private corners: WebGLBuffer;
  private screenVao: WebGLVertexArrayObject;
  private clouds: Record<(typeof STATIC_LAYERS)[number], Instances>;
  private smoke: Instances;
  private car: Instances | null = null;
  /** Average gap between neighbouring model points, for jittering the copies. */
  private carSpacing = 0;
  private emitTex: WebGLTexture;
  private hdr: Target | null = null;
  /** The car is splatted here first and folded into the scene under a brightness ceiling. */
  private carTarget: Target | null = null;
  private bloom: Target[] = [];

  private bounds = FALLBACK_BOUNDS;
  private introStart = -1;
  private modelSettled = false;
  private announced = false;

  private progress = 0;
  private reduced: boolean;
  private visible = true;
  private running = false;
  private frameId = 0;
  private lastTime = 0;
  private lastDistance = 0;
  private speed = 0;
  private roll = 0;
  private dpr: number;
  private frames = 0;
  private statsFrom = 0;
  /** Points drawn in the last frame. */
  private drawn = 0;
  /** Share of the dense layers drawn, settled by measuring the first frames. */
  private density = 1;
  private adapt = { from: -1, frames: 0, windows: 0 };
  /** GPU simulations for the car and the smoke (null where unsupported or not wanted). */
  private carSim: Simulation | null = null;
  private smokeSim: Simulation | null = null;
  private cursor: PointerState = { x: 0, y: 0, vx: 0, vy: 0, at: 0, active: false };
  /** Time banked towards the next simulation step (s). */
  private simClock = 0;
  /** Per simulation: simulate until this time (s), and whether any grain may be off rest. */
  private awake = { car: -1, smoke: -1 };
  private lastSlide = 0;
  private stirred = { car: false, smoke: false };
  /** Terrain nudge strength, faded in and out with the cursor, and the last ray it followed. */
  private nudge = 0;
  private nudgeRay: [Vec3, Vec3] = [
    [0, 0, 0],
    [0, 0, -1],
  ];
  /** Sphere around everything the smoke can reach. */
  private smokeBounds: { centre: Vec3; radius: number } = { centre: [0, 0, 0], radius: 0 };

  private view = mat4();
  private proj = mat4();
  private viewProj = mat4();
  private inverse = mat4();
  private prevViewProj = mat4();
  private model = mat4();
  private prevModel = mat4();
  private prevEye: Vec3 = [0, 0, 0];
  private first = true;

  private white = hexToLinear(T.colour.white);
  private background = hexToRgb(T.colour.background);
  private haze = hexToLinear(T.horizon.haze);
  private tints = new Map<string, Vec3>();

  private constructor(
    private canvas: Surface,
    private gl: WebGL2RenderingContext,
    private options: EngineOptions,
    private emit: (e: EngineEvent) => void,
  ) {
    this.reduced = options.reducedMotion;
    this.dpr = options.dpr;
    this.format = pickTargetFormat(gl);

    this.particle = {
      still: createProgram(gl, staticVertex, particleFragment),
      body: createProgram(gl, bodyVertex, particleFragment),
      smoke: createProgram(gl, smokeVertex, particleFragment),
    };
    this.simPrograms = {
      body: createProgram(gl, fullscreenVertex, bodySimFragment),
      smoke: createProgram(gl, fullscreenVertex, smokeSimFragment),
    };
    this.post = {
      prefilter: createProgram(gl, fullscreenVertex, prefilterFragment),
      down: createProgram(gl, fullscreenVertex, downFragment),
      up: createProgram(gl, fullscreenVertex, upFragment),
      composite: createProgram(gl, fullscreenVertex, compositeFragment),
      ceiling: createProgram(gl, fullscreenVertex, ceilingFragment),
      horizon: createProgram(gl, fullscreenVertex, horizonFragment),
    };

    this.corners = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.screenVao = gl.createVertexArray()!;

    const counts = options.mobile ? T.counts.mobile : T.counts.desktop;
    const track = buildTrackClouds(this.ride.track, T.track, counts);
    const stars = buildStars(counts.stars, T.track);
    const make = (c: { positions: Float32Array; seeds: Float32Array; count: number }) =>
      createInstances(gl, this.corners, c.positions, c.seeds, c.count);
    this.clouds = {
      stars: make(stars),
      fog: make(track.fog),
      terrain: make(track.terrain),
      road: make(track.road),
      edge: make(track.edge),
    };
    const smoke = buildSmoke(counts.smoke, T.smoke.emit);
    this.smoke = make(smoke);
    // Simulation needs half-float render targets; phones simulate the car only.
    if (this.canSimulate && !options.mobile) {
      this.smokeSim = createSimulation(gl, this.format, smoke.count, T.pointer.textureWidth, [
        { values: smoke.positions, size: 3 },
        { values: smoke.seeds, size: 4 },
      ]);
    }
    this.emitTex = gl.createTexture()!;
    this.updateEmitters();

    const lost = (event: Event) => {
      event.preventDefault();
      this.stop();
      this.emit({ type: "status", status: "error", message: "WebGL context lost" });
    };
    (canvas as EventTarget).addEventListener("webglcontextlost", lost);
    (canvas as EventTarget).addEventListener("contextlost", lost);

    this.resize(options.width, options.height, options.dpr);
    void this.loadModel(options.modelUrl, counts.car);
    this.start();
  }

  setProgress(p: number) {
    this.progress = clamp(p, 0, 1);
  }

  setReducedMotion(value: boolean) {
    this.reduced = value;
    // Thrown grains settle at once when motion is turned down.
    for (const sim of [this.carSim, this.smokeSim]) if (sim) resetSimulation(this.gl, sim);
  }

  setPointer(pointer: PointerState) {
    this.cursor = pointer;
  }

  private get canSimulate() {
    return this.format.decode === 1;
  }

  setVisible(value: boolean) {
    this.visible = value;
    if (value) this.start();
    else this.stop();
  }

  resize(width: number, height: number, dpr: number) {
    const gl = this.gl;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.dpr = dpr;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.hdr) deleteTarget(gl, this.hdr);
    if (this.carTarget) deleteTarget(gl, this.carTarget);
    this.bloom.forEach((t) => deleteTarget(gl, t));
    this.hdr = createTarget(gl, w, h, this.format);
    this.carTarget = createTarget(gl, w, h, this.format);
    this.bloom = [];
    let bw = w;
    let bh = h;
    for (let i = 0; i < T.render.bloom.levels; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloom.push(createTarget(gl, bw, bh, this.format));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    this.stop();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private start() {
    if (this.running || !this.visible) return;
    this.running = true;
    this.lastTime = 0;
    this.frameId = schedule(this.frame);
  }

  private stop() {
    this.running = false;
    unschedule(this.frameId);
  }

  private frame = () => {
    if (!this.running) return;
    this.frameId = schedule(this.frame);
    if (this.gl.isContextLost()) return;
    this.render(performance.now() / 1000);

    if (!this.announced && this.modelSettled) {
      this.announced = true;
      this.emit({ type: "status", status: "ready" });
    }
    const now = performance.now();
    if (this.modelSettled) this.adaptDensity(now);
    if (this.options.stats) {
      this.frames++;
      if (now - this.statsFrom >= 1000) {
        const fps = Math.round((this.frames * 1000) / (now - this.statsFrom));
        this.emit({ type: "stats", stats: { fps, points: this.drawn, density: this.density } });
        this.frames = 0;
        this.statsFrom = now;
      }
    }
  };

  /**
   * After a warm-up, measures a few short windows and thins the dense layers whenever the
   * frame rate falls short of the target, roughly in proportion; then leaves it alone.
   */
  private adaptDensity(now: number) {
    const a = T.render.adaptive;
    const s = this.adapt;
    if (s.windows >= a.windows) return;
    if (s.from < 0) {
      s.from = now + a.warmup;
      return;
    }
    if (now < s.from) return;
    s.frames++;
    const elapsed = now - s.from;
    if (elapsed < a.window) return;
    const fps = (s.frames * 1000) / elapsed;
    if (fps < a.target - 3) this.density = Math.max(a.min, this.density * clamp(fps / a.target, 0.5, 0.92));
    s.windows++;
    s.from = now;
    s.frames = 0;
  }

  private tint(look: Look, chapter: Vec3, ground: Vec3): Vec3 {
    if (look.colour === "chapter") return chapter;
    if (look.colour === "ground") return ground;
    let c = this.tints.get(look.colour);
    if (!c) this.tints.set(look.colour, (c = hexToLinear(look.colour)));
    return c;
  }

  private async loadModel(url: string, count: number) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status}`);
      const raw = new Float32Array(await response.arrayBuffer());
      const { cloud, bounds } = sampleModel(raw, count, T.car);
      this.bounds = bounds;
      this.carSpacing = cloud.spacing;
      this.car = createInstances(
        this.gl,
        this.corners,
        cloud.positions,
        cloud.seeds,
        cloud.count,
        cloud.frames,
        T.car.copies,
      );
      if (this.canSimulate) {
        this.carSim = createSimulation(this.gl, this.format, cloud.count * T.car.copies, T.pointer.textureWidth, [
          { values: cloud.positions, size: 3, half: true },
          { values: cloud.seeds, size: 4 },
          { values: cloud.frames, size: 4, half: true },
        ]);
      }
      this.updateEmitters();
    } catch {
      // The scene still works without the car; the ride and smoke carry on.
    }
    this.introStart = performance.now() / 1000;
    this.modelSettled = true;
  }

  /** Height that puts the model's floor on the road. */
  private get carLift() {
    return -this.bounds.min[1] * T.car.scale;
  }

  private carMatrix(out: Float32Array, pose: { d: number; u: number; yaw: number; pitch: number; roll: number }) {
    const pos = carPosition(this.ride, pose);
    pos[1] += this.carLift;
    return bodyMatrix(out, pos, pose.yaw, pose.pitch, pose.roll, T.car.scale);
  }

  /** Samples the rear wheels along the slide into a float texture the smoke shader reads. */
  private updateEmitters() {
    const gl = this.gl;
    const n = T.smoke.samples;
    const data = new Float32Array(n * 3 * 4);
    const m = mat4();
    const half = Math.max(-this.bounds.min[2], this.bounds.max[2]) * 0.85;
    const y = this.bounds.min[1] + T.car.wheelLift;
    const points: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const pose = slidePose(this.ride, i / (n - 1));
      this.carMatrix(m, pose);
      const ground = carPosition(this.ride, pose)[1];
      const left = transformPoint(m, [T.car.rearAxle, y, -half]);
      const right = transformPoint(m, [T.car.rearAxle, y, half]);
      const forward = transformDirection(m, [1, 0, 0]);
      points.push(left, right);
      data.set([...left, ground], i * 4);
      data.set([...right, ground], (n + i) * 4);
      data.set([...forward, 0], (2 * n + i) * 4);
    }
    const centre = points
      .reduce((acc, q) => [acc[0] + q[0], acc[1] + q[1], acc[2] + q[2]], [0, 0, 0])
      .map((v) => v / points.length) as Vec3;
    const s = T.smoke;
    const carHeight = (this.bounds.max[1] - this.bounds.min[1]) * T.car.scale;
    // Grown puff, kick, rise, swirl and a thrown grain's reach on top of the wheel path.
    const reach = s.spread[1] + s.kick + s.ceiling * carHeight + s.swirl[0] + 1.5;
    const radius = Math.max(...points.map((q) => Math.hypot(q[0] - centre[0], q[1] - centre[1], q[2] - centre[2])));
    this.smokeBounds = { centre, radius: radius + reach };
    gl.bindTexture(gl.TEXTURE_2D, this.emitTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 3, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private render(t: number) {
    const gl = this.gl;
    const hdr = this.hdr!;
    const cam = T.camera;
    const dt = this.lastTime ? clamp(t - this.lastTime, 1 / 240, 0.1) : 1 / 60;
    this.lastTime = t;
    // Reduced motion: still frames at the stops, no churn or twinkle.
    const time = this.reduced ? 0 : t;
    const p = this.reduced ? stillFrame(this.ride, this.progress) : this.progress;

    // Choreography.
    const pose = carPose(this.ride, p);
    const carCentre = carPosition(this.ride, pose);
    carCentre[1] += this.carLift;
    const view = cameraPose(this.ride, p, { centre: carCentre, d: pose.d, u: pose.u });

    const travelled = Math.abs(view.distance - this.lastDistance) / dt;
    this.lastDistance = view.distance;
    if (this.reduced || this.first) {
      this.speed = 0;
      this.roll = 0;
    } else {
      this.speed = damp(this.speed, Math.min(travelled, cam.topSpeed), cam.damping, dt);
      const bend = this.ride.track.curvature(view.distance + cam.lookAhead * 0.5);
      const roll = clamp(-bend * this.speed * cam.rollGain, -cam.maxRoll, cam.maxRoll) * DEG;
      this.roll = damp(this.roll, roll, cam.damping, dt);
    }

    // Camera matrices.
    const w = hdr.width;
    const h = hdr.height;
    const aspect = w / h;
    const kick = Math.min(this.speed * cam.fovKick, cam.maxFovKick);
    const minVertical = 2 * Math.atan(Math.tan((cam.minHorizontalFov * DEG) / 2) / aspect);
    const fovY = Math.max((cam.fov + kick) * DEG, minVertical + kick * DEG);
    perspective(this.proj, fovY, aspect, cam.near, cam.far);
    lookAt(this.view, view.eye, view.target, this.roll);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.inverse, this.viewProj);
    if (this.first || this.reduced) this.prevViewProj.set(this.viewProj);
    const focus = view.focus;
    const colour = chapterColour(this.ride, p);
    const ground = chapterColour(this.ride, p, "ground");

    const intro =
      this.introStart < 0 ? 0 : this.reduced ? 1 : clamp((t - this.introStart) / T.car.intro, 0, 1);
    const form = pose.form * intro;
    this.carMatrix(this.model, pose);
    if (this.first) this.prevModel.set(this.model);
    const carFormed = Boolean(this.car && form > 0 && this.carTarget);
    // Scattered while assembling, so the sphere grows with the scatter.
    const carRadius = T.car.scale * (1.2 + (T.car.formSpread * 1.4 + T.car.formLift) * (1 - form)) + 1;
    const carVisible = sphereInFrustum(this.viewProj, carCentre, carRadius);
    const carDrawn = carFormed && carVisible;
    const smokeLive = pose.slide > 0 && pose.slide < T.smoke.emit[1] + T.smoke.life;
    const smokeVisible = sphereInFrustum(this.viewProj, this.smokeBounds.centre, this.smokeBounds.radius);
    const smokeDrawn = smokeLive && smokeVisible;
    const thinned = (inst: Instances) => Math.max(1, Math.floor(inst.count * this.density));

    const bodyUniforms = (prog: Program) => {
      const c = T.car;
      gl.uniform1f(prog.u.uTime, time);
      gl.uniformMatrix4fv(prog.u.uModel, false, this.model);
      gl.uniform1f(prog.u.uForm, form);
      gl.uniform4f(prog.u.uFormShape, c.formSpread, c.formLift, c.formSwirl, c.formDelay);
      gl.uniform1f(prog.u.uShimmer, this.reduced ? 0 : c.shimmer);
      gl.uniform1i(prog.u.uCopies, c.copies);
      gl.uniform1f(prog.u.uSpread, this.carSpacing * c.copySpread);
      gl.uniform1f(prog.u.uEdgeTighten, c.edgeTighten);
    };
    const smokeUniforms = (prog: Program) => {
      const s = T.smoke;
      gl.uniform1f(prog.u.uTime, time);
      gl.uniform3fv(prog.u.uCamPos, view.eye);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.emitTex);
      gl.uniform1i(prog.u.uEmit, 2);
      gl.uniform1i(prog.u.uEmitCount, s.samples);
      gl.uniform1f(prog.u.uSlide, pose.slide);
      gl.uniform4f(prog.u.uSmokeA, s.grow, s.spread[0], s.spread[1], s.rise);
      gl.uniform4f(prog.u.uSmokeB, s.swirl[0], s.swirl[1], s.swirl[2], s.kick);
      gl.uniform2f(prog.u.uSmokeSize, s.size[0], s.size[1]);
      const carHeight = (this.bounds.max[1] - this.bounds.min[1]) * T.car.scale;
      gl.uniform2f(prog.u.uSmokeLife, s.life, s.ceiling * carHeight);
      gl.uniform2f(prog.u.uSmokeFade, s.cameraFade[0], s.cameraFade[1]);
    };

    // Cursor → world ray, extrapolated from the last event to this frame (off under reduced motion).
    const P = T.pointer;
    const cursor = this.cursor;
    const age = performance.timeOrigin + performance.now() - cursor.at;
    const moving = age <= P.still;
    const lead = clamp(age, 0, P.extrapolate) / 1000;
    const cvx = moving ? cursor.vx : 0;
    const cvy = moving ? cursor.vy : 0;
    const near = unproject(this.inverse, cursor.x + cvx * lead, cursor.y + cvy * lead, -1);
    const far = unproject(this.inverse, cursor.x + cvx * lead, cursor.y + cvy * lead, 1);
    const rayDir = normalize(sub(far, near));
    // NDC per second → metres per second per metre along the ray, along the camera's right and up.
    const tanHalf = Math.tan(fovY / 2);
    const vRight = cvx * aspect * tanHalf;
    const vUp = cvy * tanHalf;
    const v = this.view;
    const rayVel: Vec3 = [0, 1, 2].map((k) => v[k * 4] * vRight + v[k * 4 + 1] * vUp) as Vec3;
    const cursorOn = cursor.active && !this.reduced;
    this.nudge = damp(this.nudge, cursorOn ? 1 : 0, P.terrainFade, dt);
    if (cursorOn) this.nudgeRay = [near, rayDir];

    // A layer simulates only while in frame and for `settle` seconds after the moving cursor last
    // passed near it; otherwise its state is left as it is and the draw keeps reading it.
    const passes = (centre: Vec3, radius: number) => {
      const rel = sub(centre, near);
      const along = rel[0] * rayDir[0] + rel[1] * rayDir[1] + rel[2] * rayDir[2];
      const off = Math.hypot(rel[0] - rayDir[0] * along, rel[1] - rayDir[1] * along, rel[2] - rayDir[2] * along);
      return along > -radius && off < radius;
    };
    const stirring = cursorOn && moving;
    if (stirring && carFormed && passes(carCentre, carRadius + 3 * P.car.radius)) {
      this.awake.car = t + P.car.settle;
    }
    if (stirring && smokeLive && passes(this.smokeBounds.centre, this.smokeBounds.radius + 3 * P.smoke.radius)) {
      this.awake.smoke = t + P.smoke.settle;
    }
    // Displaced smoke grains must be put back as they are unborn and reborn by scrolling.
    if (this.stirred.smoke && smokeLive && pose.slide !== this.lastSlide) {
      this.awake.smoke = Math.max(this.awake.smoke, t + 0.1);
    }
    this.lastSlide = pose.slide;
    // Gone from the ride: start clean next time.
    if (this.carSim && this.stirred.car && !carFormed) {
      resetSimulation(gl, this.carSim);
      this.stirred.car = false;
    }
    if (this.smokeSim && this.stirred.smoke && !smokeLive) {
      resetSimulation(gl, this.smokeSim);
      this.stirred.smoke = false;
    }

    // At most `rate` steps per second whatever the display rate; each step covers the time banked.
    this.simClock += dt;
    const stepDue = this.simClock >= 0.95 / P.rate;
    const simDt = Math.min(this.simClock, P.maxStep);
    if (stepDue) this.simClock = 0;

    const step = (
      sim: Simulation,
      prog: Program,
      cfg: (typeof P)["car" | "smoke"],
      drawn: number,
      setup: (prog: Program) => void,
    ) => {
      const src = sim.states[sim.read];
      const dst = sim.states[1 - sim.read];
      const u = prog.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, sim.width, Math.min(sim.height, Math.ceil(drawn / sim.width)));
      gl.useProgram(prog.program);
      const textures = [src.offset, src.velocity, ...sim.data];
      const names = ["uOffset", "uVelocity", "uDataPos", "uDataSeed", "uDataFrame"];
      textures.forEach((tex, i) => {
        gl.activeTexture(gl.TEXTURE3 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(u[names[i]], 3 + i);
      });
      gl.uniform1i(u.uWidth, sim.width);
      gl.uniform1i(u.uCount, sim.count);
      gl.uniform1f(u.uDt, simDt);
      gl.uniform4f(u.uSpring, cfg.spring, cfg.damping, P.swirl, P.maxSpeed);
      gl.uniform4f(u.uCursor, cursorOn ? cfg.radius : 0, cfg.lateral, cfg.carry, cfg.rest);
      gl.uniform1f(u.uCoupling, P.coupling);
      gl.uniform1f(u.uDrift, cfg.drift);
      gl.uniform3fv(u.uRayOrigin, near);
      gl.uniform3fv(u.uRayDir, rayDir);
      gl.uniform3fv(u.uRayVel, rayVel);
      setup(prog);
      gl.bindVertexArray(this.screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      sim.read = 1 - sim.read;
    };
    gl.disable(gl.BLEND);
    if (!this.reduced && stepDue && carDrawn && this.car && this.carSim && t < this.awake.car) {
      step(this.carSim, this.simPrograms.body, P.car, thinned(this.car) * T.car.copies, bodyUniforms);
      this.stirred.car = true;
    }
    if (!this.reduced && stepDue && smokeDrawn && this.smokeSim && t < this.awake.smoke) {
      step(this.smokeSim, this.simPrograms.smoke, P.smoke, thinned(this.smoke), smokeUniforms);
      this.stirred.smoke = true;
    }
    // The draw reads the state just written; samplers always point at units 3/4 so they never
    // alias a render target.
    const bindState = (prog: Program, sim: Simulation | null) => {
      const on = Boolean(sim) && !this.reduced;
      gl.uniform1f(prog.u.uSimOn, on ? 1 : 0);
      gl.uniform1f(prog.u.uDt, dt);
      gl.uniform1i(prog.u.uSimOffset, 3);
      gl.uniform1i(prog.u.uSimVelocity, 4);
      if (!sim || !on) return;
      const s = sim.states[sim.read];
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, s.offset);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, s.velocity);
      gl.uniform1i(prog.u.uSimWidth, sim.width);
    };

    // Particles → HDR buffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.drawn = 0;
    this.horizon(view.eye, view.distance, colour);

    const common = (prog: Program, look: Look) => {
      const u = prog.u;
      gl.useProgram(prog.program);
      gl.uniformMatrix4fv(u.uView, false, this.view);
      gl.uniformMatrix4fv(u.uProj, false, this.proj);
      gl.uniformMatrix4fv(u.uPrevViewProj, false, this.prevViewProj);
      gl.uniform3fv(u.uCamPos, view.eye);
      gl.uniform2f(u.uViewport, w, h);
      gl.uniform1f(u.uTime, time);
      gl.uniform3fv(u.uColor, this.tint(look, colour, ground));
      gl.uniform3fv(u.uWhite, this.white);
      gl.uniform1f(u.uHueJitter, T.colour.hueJitter * DEG);
      gl.uniform2f(u.uValue, T.colour.value[0], T.colour.value[1]);
      gl.uniform4f(u.uDof, focus, T.dof.nearAperture, T.dof.farAperture, 0);
      gl.uniform2f(u.uBokeh, T.dof.bokehShare, T.dof.bokehRange);
      gl.uniform1f(u.uSharpPx, look.sharpPx * this.dpr);
      gl.uniform4f(
        u.uLimits,
        T.splat.minPx * this.dpr,
        T.splat.maxPx * this.dpr,
        T.splat.subPixelFalloff,
        cam.near,
      );
      gl.uniform3f(u.uStreak, this.reduced ? 0 : T.streak.gain, T.streak.maxPx * this.dpr, T.streak.trail);
      gl.uniform3f(u.uAtmos, T.splat.nearFade, T.splat.farStart, T.splat.farDensity);
      gl.uniform1f(u.uSize, look.size);
      gl.uniform1f(u.uIntensity, look.intensity / this.format.decode);
      gl.uniform1f(u.uWhiteMix, look.whiteMix);
      gl.uniform2f(u.uSpark, look.spark, T.colour.sparkBoost);
      gl.uniform2f(u.uTwinkle, look.twinkle, look.twinkleSpeed);
    };
    const draw = (inst: Instances, count = inst.count) => {
      gl.bindVertexArray(inst.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      this.drawn += count;
    };

    const still = this.particle.still;
    for (const layer of STATIC_LAYERS) {
      common(still, T.layers[layer]);
      const follow = layer === "stars" ? 1 : 0;
      gl.uniform1f(still.u.uFollow, follow);
      gl.uniform3fv(still.u.uPrevCamPos, this.first ? view.eye : this.prevEye);
      if (layer === "fog") gl.uniform3f(still.u.uDrift, ...T.track.fogDrift);
      else if (layer === "terrain") gl.uniform3f(still.u.uDrift, ...T.track.terrainDrift);
      else gl.uniform3f(still.u.uDrift, 0, 0, 0);
      const nudged = layer === "terrain" && this.nudge > 0.001;
      gl.uniform2f(still.u.uNudge, P.terrain.radius, nudged ? P.terrain.shove * this.nudge : 0);
      gl.uniform3fv(still.u.uRayOrigin, this.nudgeRay[0]);
      gl.uniform3fv(still.u.uRayDir, this.nudgeRay[1]);
      draw(this.clouds[layer], ADAPTIVE.has(layer) ? thinned(this.clouds[layer]) : undefined);
    }

    if (smokeDrawn) {
      const smoke = this.particle.smoke;
      common(smoke, T.layers.smoke);
      smokeUniforms(smoke);
      bindState(smoke, this.smokeSim);
      draw(this.smoke, thinned(this.smoke));
    }

    if (this.car && carDrawn && this.carTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.carTarget.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const body = this.particle.body;
      const c = T.car;
      common(body, T.layers.car);
      // The body is never blurred: no bokeh, no far blur.
      gl.uniform4f(body.u.uDof, focus, 0, 0, 0);
      bodyUniforms(body);
      gl.uniformMatrix4fv(body.u.uPrevModel, false, this.reduced ? this.model : this.prevModel);
      gl.uniform1f(body.u.uEdgeBoost, c.edgeBoost);
      bindState(body, this.carSim);
      draw(this.car, thinned(this.car) * c.copies);
    }
    gl.bindVertexArray(null);

    this.bloomPass(hdr, carDrawn);

    // The car joins the full-resolution scene after bloom has been taken, so no half-resolution
    // glow is laid over it.
    if (carDrawn && this.carTarget) {
      const ceiling = this.post.ceiling;
      gl.bindVertexArray(this.screenVao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      this.fullscreen(ceiling, hdr, this.carTarget.tex, w, h);
      gl.uniform2f(ceiling.u.uCeiling, T.carCeiling, this.format.decode);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
    this.composite(hdr, time);

    this.prevViewProj.set(this.viewProj);
    this.prevModel.set(this.model);
    this.prevEye = view.eye;
    this.first = false;
  }

  /** Glow behind the horizon in the chapter colour, plus cool haze, under the dust. */
  private horizon(eye: Vec3, distance: number, colour: Vec3) {
    const gl = this.gl;
    const hz = T.horizon;
    const prog = this.post.horizon;
    const far = this.ride.track.frame(distance + hz.distance).pos;
    const dx = far[0] - eye[0];
    const dz = far[2] - eye[2];
    const len = Math.hypot(dx, dz) || 1;
    gl.bindVertexArray(this.screenVao);
    gl.useProgram(prog.program);
    gl.uniformMatrix4fv(prog.u.uInvViewProj, false, this.inverse);
    gl.uniform3fv(prog.u.uEye, eye);
    gl.uniform3fv(prog.u.uGlowColor, colour);
    gl.uniform4f(prog.u.uGlow, hz.intensity, hz.height, hz.below, hz.spread);
    gl.uniform2f(prog.u.uGlowDir, dx / len, dz / len);
    gl.uniform3fv(prog.u.uHazeColor, this.haze);
    gl.uniform3f(prog.u.uHaze, hz.hazeIntensity, hz.hazeHeight, hz.hazeOffset);
    gl.uniform1f(prog.u.uEncode, 1 / this.format.decode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private fullscreen(prog: Program, target: Target | null, src: WebGLTexture, srcW: number, srcH: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(prog.u.uSrc, 0);
    gl.uniform2f(prog.u.uTexel, 1 / srcW, 1 / srcH);
  }

  private bloomPass(hdr: Target, carGlow: boolean) {
    const gl = this.gl;
    const b = T.render.bloom;
    const { prefilter, down, up } = this.post;
    gl.bindVertexArray(this.screenVao);
    gl.disable(gl.BLEND);

    this.fullscreen(prefilter, this.bloom[0], hdr.tex, hdr.width, hdr.height);
    gl.uniform4f(prefilter.u.uThreshold, b.threshold, b.knee, this.format.decode, 1 / this.format.decode);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.carTarget!.tex);
    gl.uniform1i(prefilter.u.uCar, 1);
    gl.uniform2f(prefilter.u.uCarBloom, T.carCeiling, carGlow ? T.carBloom : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    for (let i = 1; i < this.bloom.length; i++) {
      const src = this.bloom[i - 1];
      this.fullscreen(down, this.bloom[i], src.tex, src.width, src.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Upsample back up, adding each level onto the one above it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.bloom.length - 1; i > 0; i--) {
      const src = this.bloom[i];
      this.fullscreen(up, this.bloom[i - 1], src.tex, src.width, src.height);
      gl.uniform1f(up.u.uRadius, b.radius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
  }

  private composite(hdr: Target, time: number) {
    const gl = this.gl;
    const r = T.render;
    const prog = this.post.composite;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
    gl.uniform1i(prog.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloom[0].tex);
    gl.uniform1i(prog.u.uBloom, 1);
    gl.uniform1f(prog.u.uDecode, this.format.decode);
    gl.uniform1f(prog.u.uExposure, r.exposure);
    // The upsample chain sums every level, so divide its gain by the level count.
    gl.uniform1f(prog.u.uBloomGain, r.bloom.strength / r.bloom.levels);
    gl.uniform1f(prog.u.uVignette, r.vignette);
    gl.uniform1f(prog.u.uGrain, r.grain);
    gl.uniform1f(prog.u.uTime, time);
    gl.uniform3fv(prog.u.uBackground, this.background);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
