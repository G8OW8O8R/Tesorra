import { sceneTuning, type BodyId, type StopId } from "@/lib/scene-tuning";
import {
  bodyPoses,
  carPose,
  carPosition,
  cameraPose,
  chapterColour,
  entranceOffset,
  fieldOfView,
  formulaAt,
  getRide,
  lensShift,
  motoAt,
  nearLive,
  portraitOf,
  slidePose,
  startLights,
  stillFrame,
  storeProducts,
  type BodyPose,
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
  random,
  sphereInFrustum,
  sub,
  transformDirection,
  transformPoint,
  unproject,
  type Mat4,
  type Vec3,
} from "./math";
import {
  createSimData,
  createSimPool,
  createSimulation,
  resetSimulation,
  type SimPool,
  type SimSlot,
  type SimState,
  type Simulation,
} from "./sim";
import { buildSmoke, buildStars, buildTrackClouds, sampleModel, type ModelBounds } from "./particles";
import type { EngineEvent, EngineOptions, MarkMask, MarkState, PointerState } from "./protocol";
import { buildGrid, gantryShape, lampShapes, riderShape } from "./shapes";
import {
  bodySimFragment,
  bodyVertex,
  ceilingFragment,
  compositeFragment,
  downFragment,
  fullscreenVertex,
  horizonFragment,
  MARK_CUTS,
  particleFragment,
  prefilterFragment,
  smokeSimFragment,
  smokeVertex,
  staticVertex,
  trailFragment,
  upFragment,
} from "./shaders";

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Look = (typeof sceneTuning.layers)[keyof typeof sceneTuning.layers];
/** Layers thinned by the adaptive density (the rest are cheap). */
const ADAPTIVE = new Set<string>(["road", "edge", "terrain"]);

const T = sceneTuning;
const STATIC_LAYERS = ["stars", "fog", "terrain", "road", "edge", "grid"] as const;
/** Bounds used until the model arrives (or if it never does). */
const FALLBACK_BOUNDS: ModelBounds = { min: [-1, -0.3, -0.42], max: [1, 0.3, 0.42] };

/** Bodies in loading order, and the stop whose cursor simulation each one shares. */
const BODIES: BodyId[] = ["car", "formula", "moto", "gantry"];
const GROUP: Record<BodyId, StopId> = { car: "drift", formula: "formula", moto: "moto", gantry: "live" };

type BodySpec = {
  scale: number;
  copies: number;
  copySpread: number;
  edgeTighten: number;
  edgeBoost: number;
  neighbours: number;
  edgeExtra: number;
  shimmer: number;
  formSpread: number;
  formLift: number;
  formSwirl: number;
  formDelay: number;
  glow: number;
};

type Body = {
  id: BodyId;
  spec: BodySpec;
  group: StopId;
  entries: number;
  inst: Instances | null;
  /** Average gap between neighbouring model points, for jittering the copies. */
  spacing: number;
  bounds: ModelBounds;
  /** Farthest model point from the centre (model units). */
  extent: number;
  slot: SimSlot | null;
  model: Mat4;
  prevModel: Mat4;
  centre: Vec3;
  form: number;
  radius: number;
  formed: boolean;
  drawn: boolean;
};

type EmitterSpec = {
  emit: readonly [number, number];
  grow: number;
  life: number;
  spread: readonly [number, number];
  rise: number;
  kick: number;
  swirl: readonly [number, number, number];
  size: readonly [number, number];
  cameraFade: readonly [number, number];
  samples: number;
  streak: number;
};

/** Grains born along a body's run: tyre smoke, the formula's wake, the knee sparks. */
type Emitter = {
  spec: EmitterSpec;
  look: Look;
  body: BodyId;
  inst: Instances;
  tex: WebGLTexture;
  ready: boolean;
  /** Smoke rises to a soft ceiling this high above the road (m). */
  ceiling: number;
  /** Sphere around everything the grains can reach. */
  bounds: { centre: Vec3; radius: number };
  sim: Simulation | null;
  slide: number;
  live: boolean;
  drawn: boolean;
};
type EmitterId = "smoke" | "burnout" | "wake" | "sparks";
const EMITTERS: EmitterId[] = ["smoke", "burnout", "wake", "sparks"];
/** Times (s) as uniforms: "not yet" and "never". */
const NEVER = 1e9;
/** Most letters the composite tells apart for the wordmark's assembly. */
const MARK_LETTERS = MARK_CUTS + 1;
/** GPU timer queries in flight and the time they added up to since the last stats. */
type GpuTimer = {
  ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  pending: WebGLQuery[];
  ms: number;
  n: number;
};

const schedule: (cb: (now: number) => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const unschedule: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
/** Longest slice of model analysis while the page's intro still covers the scene (ms). */
const RUSH_SLICE = 40;

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
    trail: Program;
  };
  private corners: WebGLBuffer;
  private screenVao: WebGLVertexArrayObject;
  private clouds: Record<(typeof STATIC_LAYERS)[number], Instances>;
  private bodies: Record<BodyId, Body>;
  private emitters: Record<EmitterId, Emitter>;
  /** The five start lights, in world space once the gantry has been built. */
  private lamps: Instances[] = [];
  private hdr: Target | null = null;
  /** Bodies are splatted here first and folded into the scene under a brightness ceiling. */
  private carTarget: Target | null = null;
  /** The dust of the last frame (before the bodies join), faded into the next one. */
  private history: Target | null = null;
  private historyValid = false;
  private bloom: Target[] = [];

  /** When (s) the car's entrance starts (it assembles meanwhile); -1 until the car is in. */
  private introStart = -1;
  /** When (s) the wordmark starts gathering from dust; -1 = it is whole from the start. */
  private markFrom = -1;
  /** The wordmark's mask, where the page has it and how much of it shows. */
  private mark: { tex: WebGLTexture; cuts: Float32Array; letters: number; slope: number } | null = null;
  private markState: MarkState = { rect: [0, 0, 0, 0], opacity: 0, fog: 1 };
  /** Burnout smoke is born between these times (s). */
  private burn = { from: NEVER, until: NEVER };
  private modelSettled = false;
  private announced = false;

  /** Ride progress as the page last sent it, and as the camera follows it (damped every frame). */
  private target = 0;
  private progress = 0;
  private snap = true;
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
  /** Development stats: worker time spent in frames, and GPU time from timer queries where supported. */
  private cpuTime = 0;
  private timer: GpuTimer | null = null;
  /** Points drawn in the last frame. */
  private drawn = 0;
  /** Share of the dense layers and bodies drawn, settled by measuring the first frames. */
  private density = 1;
  /** Highest density the measuring may climb to (desktop: the point ceiling of a busy stop). */
  private densityCap = 1;
  private adapt = { from: -1, frames: 0, windows: 0, steady: 0, short: 0, capped: false };
  /** Every body is in: frame rates are measured only once the loading has stopped. */
  private loaded = false;
  /** Stops still to be drawn once off screen, so their programs and buffers are warm before the ride. */
  private warmQueue: number[] = [];
  /** When (s) the ride came near the live stop and its start lights began, or -1 while away. */
  private lightsSince = -1;
  /** Until then (performance.now) the intro covers the scene and analysis may hold the thread longer. */
  private rushUntil = 0;
  /**
   * GPU state for the bodies' grains, shared by stops: the stop the cursor last stirred owns it
   * (null where unsupported).
   */
  private pool: SimPool | null = null;
  private owner: StopId | null = null;
  private cursor: PointerState = { x: 0, y: 0, vx: 0, vy: 0, at: 0, active: false };
  /** Time banked towards the next simulation step (s). */
  private simClock = 0;
  /** Per simulation: simulate until this time (s), and whether any grain may be off rest. */
  private awake = { bodies: -1, smoke: -1 };
  private lastSlide = 0;
  private stirred = { bodies: false, smoke: false };
  /** Terrain nudge strength, faded in and out with the cursor, and the last ray it followed. */
  private nudge = 0;
  private nudgeRay: [Vec3, Vec3] = [
    [0, 0, 0],
    [0, 0, -1],
  ];

  private view = mat4();
  private proj = mat4();
  private viewProj = mat4();
  private inverse = mat4();
  private prevViewProj = mat4();
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
    if (options.stats) {
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as GpuTimer["ext"] | null;
      if (ext) this.timer = { ext, pending: [], ms: 0, n: 0 };
    }

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
      trail: createProgram(gl, fullscreenVertex, trailFragment),
    };

    this.corners = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.screenVao = gl.createVertexArray()!;

    const device = options.mobile ? "mobile" : "desktop";
    const counts = T.counts[device];
    const track = buildTrackClouds(this.ride.track, T.track, counts);
    const stars = buildStars(counts.stars, T.track);
    const gantryAt = bodyPoses(this.ride, 0).gantry.d;
    const grid = buildGrid(this.ride.track, gantryAt, T.live.grid, T.track, counts.grid);
    const make = (c: { positions: Float32Array; seeds: Float32Array; count: number }) =>
      createInstances(gl, this.corners, c.positions, c.seeds, c.count);
    this.clouds = {
      stars: make(stars),
      fog: make(track.fog),
      terrain: make(track.terrain),
      road: make(track.road),
      edge: make(track.edge),
      grid: make(grid),
    };

    // Bodies, each with a block of rows in the shared simulation state of its stop.
    const width = T.pointer.textureWidth;
    const rowsUsed: Partial<Record<StopId, number>> = {};
    const bodies = {} as Record<BodyId, Body>;
    for (const id of BODIES) {
      const spec: BodySpec = id === "car" ? { ...T.car, glow: 1 } : T.bodies[id];
      const entries = id === "car" ? counts.car : T.bodies[id].entries[device];
      const group = GROUP[id];
      const rows = Math.ceil((entries * spec.copies) / width);
      const row = rowsUsed[group] ?? 0;
      rowsUsed[group] = row + rows;
      bodies[id] = {
        id,
        spec,
        group,
        entries,
        inst: null,
        spacing: 0,
        bounds: FALLBACK_BOUNDS,
        extent: 1.2,
        slot: { row, rows, count: 0, data: [] },
        model: mat4(),
        prevModel: mat4(),
        centre: [0, 0, 0],
        form: 0,
        radius: 0,
        formed: false,
        drawn: false,
      };
    }
    this.bodies = bodies;
    // Desktop starts at the point budget of a busy stop and only climbs from there.
    if (!options.mobile) {
      const peak = counts.road + counts.edge + counts.terrain + counts.car * T.car.copies + counts.smoke;
      this.density = clamp(T.render.adaptive.budget / peak, T.render.adaptive.min, 1);
      this.densityCap = clamp(T.render.adaptive.ceiling / peak, this.density, 1);
    }
    // Phones get no grain simulation; the cursor only nudges the bodies aside there.
    if (this.canSimulate && !options.mobile) {
      this.pool = createSimPool(gl, this.format, width, Math.max(...(Object.values(rowsUsed) as number[])));
    }

    const smokeSpec: EmitterSpec = { ...T.smoke, streak: 0 };
    const burnoutSpec: EmitterSpec = { ...T.burnout, streak: 0 };
    const emitter = (spec: EmitterSpec, look: Look, body: BodyId, count: number, simulate: boolean): Emitter => {
      const cloud = buildSmoke(count, spec.emit);
      // Simulation needs half-float render targets; phones simulate the car only.
      const sim =
        simulate && this.canSimulate && !options.mobile
          ? createSimulation(gl, this.format, cloud.count, width, [
              { values: cloud.positions, size: 3 },
              { values: cloud.seeds, size: 4 },
            ])
          : null;
      return {
        spec,
        look,
        body,
        inst: make(cloud),
        tex: gl.createTexture()!,
        ready: false,
        ceiling: 0,
        bounds: { centre: [0, 0, 0], radius: 0 },
        sim,
        slide: 0,
        live: false,
        drawn: false,
      };
    };
    this.emitters = {
      smoke: emitter(smokeSpec, T.layers.smoke, "car", counts.smoke, true),
      burnout: emitter(burnoutSpec, T.layers.smoke, "car", counts.burnout, false),
      wake: emitter(T.wake, T.layers.wake, "formula", counts.wake, false),
      sparks: emitter(T.sparks, T.layers.sparks, "moto", counts.sparks, false),
    };
    this.updateEmitter("smoke");
    this.updateEmitter("burnout");

    const lost = (event: Event) => {
      event.preventDefault();
      this.stop();
      this.emit({ type: "status", status: "error", message: "WebGL context lost" });
    };
    (canvas as EventTarget).addEventListener("webglcontextlost", lost);
    (canvas as EventTarget).addEventListener("contextlost", lost);

    this.resize(options.width, options.height, options.dpr);
    this.rushUntil = performance.now() + options.warmup;
    void this.loadBodies();
    this.start();
  }

  /** The page sends the raw scroll target; `snap` jumps the camera there (arrival, resize). */
  setProgress(p: number, snap = false) {
    this.target = clamp(p, 0, 1);
    if (snap) this.snap = true;
  }

  setReducedMotion(value: boolean) {
    this.reduced = value;
    // Thrown grains settle at once when motion is turned down.
    if (this.pool) resetSimulation(this.gl, this.pool);
    const smoke = this.emitters.smoke.sim;
    if (smoke) resetSimulation(this.gl, smoke);
  }

  setPointer(pointer: PointerState) {
    this.cursor = pointer;
  }

  /** The wordmark's shape, once: one byte of coverage a texel, rows from the top. */
  setMarkMask(mask: MarkMask) {
    const gl = this.gl;
    const tex = this.mark?.tex ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.width, mask.height, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const cuts = new Float32Array(MARK_LETTERS - 1).fill(NEVER);
    cuts.set(mask.cuts.slice(0, MARK_LETTERS - 1));
    this.mark = { tex, cuts, letters: Math.min(MARK_LETTERS, mask.cuts.length + 1), slope: mask.slope };
  }

  /** Where the page has the wordmark now and how much of it shows. */
  setMark(state: MarkState) {
    this.markState = state;
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
    if (this.history) deleteTarget(gl, this.history);
    this.bloom.forEach((t) => deleteTarget(gl, t));
    this.hdr = createTarget(gl, w, h, this.format);
    this.carTarget = createTarget(gl, w, h, this.format);
    this.history = createTarget(gl, w, h, this.format);
    this.historyValid = false;
    this.bloom = [];
    let bw = w;
    let bh = h;
    for (let i = 0; i < T.render.bloom.levels[this.options.mobile ? "mobile" : "desktop"]; i++) {
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
    const from = performance.now();
    const timing = this.beginTimer();
    // Once everything is loaded, each stop is drawn once off screen (one a frame) before the ride gets there.
    const warm = this.loaded ? this.warmQueue.shift() : undefined;
    if (warm !== undefined) this.render(performance.now() / 1000, warm);
    this.render(performance.now() / 1000);
    if (timing) this.gl.endQuery(this.timer!.ext.TIME_ELAPSED_EXT);
    this.cpuTime += performance.now() - from;

    if (!this.announced && this.modelSettled) {
      this.announced = true;
      this.emit({ type: "status", status: "ready" });
    }
    const now = performance.now();
    if (this.loaded && !this.warmQueue.length) this.adaptDensity(now);
    if (this.options.stats) {
      this.frames++;
      if (now - this.statsFrom >= 1000) {
        const fps = Math.round((this.frames * 1000) / (now - this.statsFrom));
        const timer = this.timer;
        const cpu = this.cpuTime / this.frames;
        const gpu = timer && timer.n ? timer.ms / timer.n : null;
        this.emit({ type: "stats", stats: { fps, points: this.drawn, density: this.density, cpu, gpu } });
        this.frames = 0;
        this.cpuTime = 0;
        if (timer) {
          timer.ms = 0;
          timer.n = 0;
        }
        this.statsFrom = now;
      }
    }
  };

  /**
   * Collects finished GPU timings (none while the GPU reports a disjoint period) and starts a query
   * for this frame unless several are still in flight.
   */
  private beginTimer() {
    const timer = this.timer;
    if (!timer) return false;
    const gl = this.gl;
    const disjoint = gl.getParameter(timer.ext.GPU_DISJOINT_EXT) as boolean;
    while (timer.pending.length && gl.getQueryParameter(timer.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = timer.pending.shift()!;
      if (!disjoint) {
        timer.ms += (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
        timer.n++;
      }
      gl.deleteQuery(query);
    }
    if (timer.pending.length > 4) return false;
    const query = gl.createQuery();
    if (!query) return false;
    gl.beginQuery(timer.ext.TIME_ELAPSED_EXT, query);
    timer.pending.push(query);
    return true;
  }

  /**
   * After every body has loaded and a warm-up, measures short windows: `steady` windows in a row at
   * the target raise the density a step; two short of it in a row lower it roughly in proportion
   * and stop the climb. Then it is left alone. Phones keep their own fixed counts.
   */
  private adaptDensity(now: number) {
    const a = T.render.adaptive;
    const s = this.adapt;
    if (this.options.mobile || s.windows >= a.windows) return;
    if (s.from < 0) {
      s.from = now + a.warmup;
      return;
    }
    if (now < s.from) return;
    s.frames++;
    const elapsed = now - s.from;
    if (elapsed < a.window) return;
    const fps = (s.frames * 1000) / elapsed;
    if (fps < a.target - 3) {
      s.steady = 0;
      s.short++;
      if (s.short >= 2) {
        this.density = Math.max(a.min, this.density * clamp(fps / a.target, 0.5, 0.92));
        s.capped = true;
        s.short = 0;
      }
    } else if (!s.capped && this.density < this.densityCap && fps >= a.target - 1) {
      s.short = 0;
      s.steady++;
      if (s.steady >= a.steady) {
        this.density = Math.min(this.densityCap, this.density * a.raise);
        s.steady = 0;
      }
    }
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

  /**
   * The drift car first (the scene is ready once it is in), then the bodies of the later stops,
   * each analysed in slices so the ride keeps running meanwhile.
   */
  private async loadBodies() {
    await this.loadBody(this.bodies.car, () => Promise.resolve());
    // After the intro the wordmark gathers from dust, then the car slides in. When the car is in
    // only after the intro has gone, the page's own wordmark is already up: the scene's simply
    // takes its place and the car comes straight in.
    const now = performance.now();
    const gather = this.options.warmup > 0 && !this.reduced && now <= this.rushUntil + T.mark.grace;
    this.markFrom = gather ? this.rushUntil / 1000 : -1;
    this.introStart = gather ? this.rushUntil / 1000 + T.car.drive.delay : now / 1000;
    if (this.burn.until >= NEVER) this.burn.from = this.introStart;
    this.modelSettled = true;
    // Slices hand the thread back to the frame loop; while the intro covers the scene they run longer.
    let since = performance.now();
    const pause = () => {
      const now = performance.now();
      if (now < this.rushUntil && now - since < RUSH_SLICE) return Promise.resolve();
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          since = performance.now();
          resolve();
        }, 0),
      );
    };
    for (const id of BODIES.slice(1)) await this.loadBody(this.bodies[id], pause);
    this.warmQueue = [...this.ride.timeline.stopCentres];
    this.loaded = true;
  }

  private async rawPoints(id: BodyId, count: number): Promise<Float32Array> {
    const spec = id === "car" ? T.car : T.bodies[id];
    if ("model" in spec) {
      const response = await fetch(new URL(spec.model, this.options.baseUrl));
      if (!response.ok) throw new Error(`${response.status}`);
      const model = new Float32Array(await response.arrayBuffer());
      if (!("rider" in spec)) return model;
      // The bike gets its rider, knee out on the inside of the moto corner.
      const inside = this.ride.track.stops.find((s) => s.id === "moto")?.turn || 1;
      const rider = riderShape(Math.round((model.length / 3) * spec.rider), inside);
      const both = new Float32Array(model.length + rider.length);
      both.set(model);
      both.set(rider, model.length);
      return both;
    }
    return gantryShape(count);
  }

  private async loadBody(b: Body, yieldFrame: () => Promise<void>) {
    try {
      const raw = await this.rawPoints(b.id, b.entries);
      const { cloud, bounds } = await sampleModel(raw, b.entries, b.spec, yieldFrame);
      if (this.gl.isContextLost()) return;
      b.bounds = bounds;
      b.extent = Math.hypot(
        Math.max(-bounds.min[0], bounds.max[0]),
        Math.max(-bounds.min[1], bounds.max[1]),
        Math.max(-bounds.min[2], bounds.max[2]),
      );
      b.spacing = cloud.spacing;
      b.inst = createInstances(
        this.gl,
        this.corners,
        cloud.positions,
        cloud.seeds,
        cloud.count,
        cloud.frames,
        b.spec.copies,
      );
      if (this.pool && b.slot) {
        b.slot.count = Math.min(cloud.count * b.spec.copies, b.slot.rows * this.pool.width);
        b.slot.data = createSimData(this.gl, this.pool.width, [
          { values: cloud.positions, size: 3, half: true },
          { values: cloud.seeds, size: 4 },
          { values: cloud.frames, size: 4, half: true },
        ]);
      } else {
        b.slot = null;
      }
      if (b.id === "car") {
        this.updateEmitter("smoke");
        this.updateEmitter("burnout");
      }
      if (b.id === "formula") this.updateEmitter("wake");
      if (b.id === "moto") this.updateEmitter("sparks");
      if (b.id === "gantry") this.buildLamps(b);
    } catch {
      // The scene still works without this body; the ride carries on.
    }
  }

  /**
   * Places a body: on its floor by default, or rotated about the tyre contact so a leaning bike
   * keeps its wheels on the road.
   */
  private placeBody(b: Body, pose: Pick<BodyPose, "d" | "u" | "yaw" | "pitch" | "roll" | "pivot">) {
    const s = b.spec.scale;
    const floor = -b.bounds.min[1] * s;
    const pos = carPosition(this.ride, pose);
    if (pose.pivot === "ground") {
      bodyMatrix(b.model, pos, pose.yaw, pose.pitch, pose.roll, s);
      const up = normalize(transformDirection(b.model, [0, 1, 0]));
      pos[0] += up[0] * floor;
      pos[1] += up[1] * floor;
      pos[2] += up[2] * floor;
    } else pos[1] += floor;
    bodyMatrix(b.model, pos, pose.yaw, pose.pitch, pose.roll, s);
    b.centre = pos;
    return b.model;
  }

  /** Lamp discs carried from the gantry's model space into the world (the gantry never moves). */
  private buildLamps(gantry: Body) {
    const m = this.placeBody(gantry, bodyPoses(this.ride, 0).gantry);
    const counts = this.options.mobile ? T.counts.mobile : T.counts.desktop;
    const rand = random(61);
    this.lamps = lampShapes(counts.lamp).map((local) => {
      const n = local.length / 3;
      const positions = new Float32Array(local.length);
      for (let i = 0; i < n; i++) {
        positions.set(transformPoint(m, [local[i * 3], local[i * 3 + 1], local[i * 3 + 2]]), i * 3);
      }
      const seeds = Float32Array.from({ length: n * 4 }, rand);
      return createInstances(this.gl, this.corners, positions, seeds, n);
    });
  }

  /**
   * Samples an emitter's sources along its body's run into a float texture the smoke shader
   * reads: rows 0 and 1 are the two sources (with the road height), row 2 the forward direction.
   */
  private updateEmitter(id: EmitterId) {
    const gl = this.gl;
    const e = this.emitters[id];
    const n = e.spec.samples;
    const data = new Float32Array(n * 3 * 4);
    const points: Vec3[] = [];
    const car = this.bodies.car;
    const body = this.bodies[e.body];
    const scratch: Body = { ...body, model: mat4() };
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let left: Vec3;
      let right: Vec3;
      let forward: Vec3;
      let ground: number;
      if (id === "smoke" || id === "burnout") {
        // Rear wheels, through the slide or along the car's entrance into the opening view; the
        // kick runs along the scaled body axis, as it always has.
        let pose = slidePose(this.ride, t);
        if (id === "burnout") {
          const parked = carPose(this.ride, 0);
          const off = entranceOffset(this.ride, t);
          pose = { ...parked, d: parked.d + off.d, u: parked.u + off.u, yaw: parked.yaw + off.yaw };
        }
        const m = this.placeBody(scratch, pose);
        const half = Math.max(-car.bounds.min[2], car.bounds.max[2]) * 0.85;
        const y = car.bounds.min[1] + T.car.wheelLift;
        ground = carPosition(this.ride, pose)[1];
        left = transformPoint(m, [T.car.rearAxle, y, -half]);
        right = transformPoint(m, [T.car.rearAxle, y, half]);
        forward = transformDirection(m, [1, 0, 0]);
        if (id === "burnout") {
          // Parked, the smoke streams off to the right of the picture and a little away from the
          // lens rather than back along the body (which points at the camera).
          const f = this.ride.track.frame(pose.d);
          const [across, away] = T.burnout.wind;
          const wind = normalize([
            f.side[0] * across + f.tangent[0] * away,
            0,
            f.side[2] * across + f.tangent[2] * away,
          ]);
          forward = [-wind[0] * T.car.scale, 0, -wind[2] * T.car.scale];
        }
      } else if (id === "wake") {
        const pose = formulaAt(this.ride, t);
        const m = this.placeBody(scratch, pose);
        const [x, y, z] = T.wake.source;
        ground = carPosition(this.ride, pose)[1];
        left = transformPoint(m, [x, y, -z]);
        right = transformPoint(m, [x, y, z]);
        forward = normalize(transformDirection(m, [1, 0, 0]));
      } else {
        const pose = motoAt(this.ride, t);
        const m = this.placeBody(scratch, { ...pose, pivot: "ground" });
        const inside = this.ride.track.stops.find((s) => s.id === "moto")?.turn || 1;
        const [x, y, z] = T.sparks.source;
        ground = carPosition(this.ride, pose)[1];
        left = right = transformPoint(m, [x, y, inside * z]);
        forward = normalize(transformDirection(m, [1, 0, 0]));
      }
      points.push(left, right);
      data.set([...left, ground], i * 4);
      data.set([...right, ground], (n + i) * 4);
      data.set([...forward, 0], (2 * n + i) * 4);
    }
    const centre = points
      .reduce((acc, q) => [acc[0] + q[0], acc[1] + q[1], acc[2] + q[2]], [0, 0, 0])
      .map((v) => v / points.length) as Vec3;
    const s = e.spec;
    const carHeight = (car.bounds.max[1] - car.bounds.min[1]) * T.car.scale;
    const tyres = e.body === "car";
    e.ceiling = tyres ? T.smoke.ceiling * carHeight : id === "wake" ? T.wake.ceiling : T.sparks.ceiling;
    // Grown puff, kick, rise, swirl, streak and a thrown grain's reach on top of the path.
    const reach = s.spread[1] + s.kick * (tyres ? T.car.scale : 1) + e.ceiling + s.swirl[0] + s.streak + 1.5;
    const radius = Math.max(...points.map((q) => Math.hypot(q[0] - centre[0], q[1] - centre[1], q[2] - centre[2])));
    e.bounds = { centre, radius: radius + reach };
    e.ready = tyres || body.inst !== null;
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 3, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * One frame at the current progress, or with `warmAt` a warm-up frame at that progress: every body
   * and emitter in reach is drawn but nothing is shown, simulated, reported or carried to the next frame.
   */
  private render(t: number, warmAt?: number) {
    const warm = warmAt !== undefined;
    const gl = this.gl;
    const hdr = this.hdr!;
    const cam = T.camera;
    const dt = this.lastTime && !warm ? clamp(t - this.lastTime, 1 / 240, 0.1) : 1 / 60;
    if (!warm) this.lastTime = t;
    // The camera follows the page's scroll target on its own clock, so it moves evenly whatever
    // the page's frames do.
    if (!warm) {
      const jump = this.snap || this.first || this.reduced;
      this.progress = jump ? this.target : damp(this.progress, this.target, 1 / T.scroll.follow, dt);
      this.snap = false;
    }
    // Reduced motion: still frames at the stops, no churn or twinkle.
    const time = this.reduced ? 0 : t;
    const p = warm ? warmAt : this.reduced ? stillFrame(this.ride, this.progress) : this.progress;

    // Choreography: the bodies first, then the camera that frames them.
    const poses = bodyPoses(this.ride, p);
    // The car's entrance into the opening view: it slides in from the right and brakes.
    const entrance =
      this.reduced || warm || this.introStart < 0 ? 1 : clamp((t - this.introStart) / T.car.drive.time, 0, 1);
    if (entrance < 1) {
      const off = entranceOffset(this.ride, entrance);
      const c = poses.car;
      poses.car = { ...c, d: c.d + off.d, u: c.u + off.u, yaw: c.yaw + off.yaw };
    }
    for (const id of BODIES) this.placeBody(this.bodies[id], poses[id]);
    const mark = (id: BodyId) => ({ centre: this.bodies[id].centre, d: poses[id].d, u: poses[id].u });
    const w = hdr.width;
    const h = hdr.height;
    const aspect = w / h;
    // How far towards portrait the screen is (0 landscape, 1 portrait).
    const portrait = portraitOf(aspect);
    const view = cameraPose(
      this.ride,
      p,
      { drift: mark("car"), formula: mark("formula"), moto: mark("moto") },
      portrait,
    );

    // A warm-up frame keeps the speed and roll of the real ride.
    if (!warm) {
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
    }

    // Camera matrices.
    const kick = Math.min(this.speed * cam.fovKick, cam.maxFovKick);
    const fovY = fieldOfView(this.ride, aspect, kick);
    perspective(this.proj, fovY, aspect, cam.near, cam.far);
    // Portrait screens lift the picture (a lens shift): at stops clear of the panel along the
    // bottom, in the opening view to stand the wordmark higher.
    this.proj[9] = -lensShift(this.ride, view, portrait);
    lookAt(this.view, view.eye, view.target, this.roll);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.inverse, this.viewProj);
    const prevViewProj = warm ? Float32Array.from(this.prevViewProj) : null;
    if (this.first || this.reduced || warm) this.prevViewProj.set(this.viewProj);
    const focus = view.focus;
    const colour = chapterColour(this.ride, p);
    const ground = chapterColour(this.ride, p, "ground");

    // Bodies: the car waits for its intro; the rest assemble as the ride reaches them.
    const intro =
      this.introStart < 0 ? 0 : this.reduced ? 1 : clamp((t - this.introStart) / T.car.intro, 0, 1);
    let bodiesDrawn = false;
    for (const id of BODIES) {
      const b = this.bodies[id];
      const bp = poses[id];
      b.form = id === "car" ? bp.form * intro : bp.form;
      if (this.first) b.prevModel.set(b.model);
      b.formed = Boolean(b.inst && b.form > 0 && this.carTarget);
      // Scattered while assembling, so the sphere grows with the scatter.
      const sp = b.spec;
      b.radius = sp.scale * (b.extent + (sp.formSpread * 1.4 + Math.abs(sp.formLift)) * (1 - b.form)) + 1;
      b.drawn = b.formed && (warm || sphereInFrustum(this.viewProj, b.centre, b.radius));
      bodiesDrawn ||= b.drawn;
    }
    // Burnout smoke is born while the car stands in the opening view; leaving it stops the births.
    const parked = this.ride.timeline.phaseAt(p).phase.kind === "hero";
    if (!warm) {
      if (parked && this.burn.until < NEVER) this.burn = { from: Math.max(t, this.introStart), until: NEVER };
      else if (!parked && this.burn.until >= NEVER) this.burn.until = t;
    }
    for (const id of EMITTERS) {
      const e = this.emitters[id];
      if (id === "burnout") {
        const { from, until } = this.burn;
        e.live = e.ready && (this.reduced ? parked : from < NEVER && t >= from && t < until + T.burnout.cycle);
      } else {
        e.slide = poses[e.body].slide;
        e.live = e.ready && e.slide > (id === "smoke" ? 0 : e.spec.emit[0]) && e.slide < e.spec.emit[1] + e.spec.life;
      }
      e.drawn = warm ? e.ready : e.live && sphereInFrustum(this.viewProj, e.bounds.centre, e.bounds.radius);
    }
    const smoke = this.emitters.smoke;
    const thinned = (inst: Instances) => Math.max(1, Math.floor(inst.count * this.density));

    const bodyUniforms = (prog: Program, b: Body) => {
      const c = b.spec;
      gl.uniform1f(prog.u.uTime, time);
      gl.uniformMatrix4fv(prog.u.uModel, false, b.model);
      gl.uniform1f(prog.u.uForm, b.form);
      gl.uniform4f(prog.u.uFormShape, c.formSpread, c.formLift, c.formSwirl, c.formDelay);
      gl.uniform1f(prog.u.uShimmer, this.reduced ? 0 : c.shimmer);
      gl.uniform1i(prog.u.uCopies, c.copies);
      gl.uniform1f(prog.u.uSpread, b.spacing * c.copySpread);
      gl.uniform1f(prog.u.uEdgeTighten, c.edgeTighten);
    };
    const emitterUniforms = (prog: Program, e: Emitter) => {
      const s = e.spec;
      gl.uniform1f(prog.u.uTime, time);
      gl.uniform3fv(prog.u.uCamPos, view.eye);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.uniform1i(prog.u.uEmit, 2);
      gl.uniform1i(prog.u.uEmitCount, s.samples);
      gl.uniform1f(prog.u.uSlide, e.slide);
      gl.uniform4f(prog.u.uSmokeA, s.grow, s.spread[0], s.spread[1], s.rise);
      gl.uniform4f(prog.u.uSmokeB, s.swirl[0], s.swirl[1], s.swirl[2], s.kick);
      gl.uniform2f(prog.u.uSmokeSize, s.size[0], s.size[1]);
      gl.uniform2f(prog.u.uSmokeLife, s.life, e.ceiling);
      gl.uniform2f(prog.u.uSmokeFade, s.cameraFade[0], s.cameraFade[1]);
      gl.uniform1f(prog.u.uSmokeStreak, this.reduced ? 0 : s.streak);
      // Burnout grains run on a clock instead of the slide (reduced motion: one still plume).
      const burnout = e === this.emitters.burnout;
      const born = this.reduced ? { from: -NEVER, until: parked ? NEVER : -NEVER } : this.burn;
      gl.uniform4f(prog.u.uBurn, burnout ? T.burnout.cycle : 0, born.from, born.until, this.introStart);
      gl.uniform1f(prog.u.uBurnDrive, T.car.drive.time);
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

    // A simulation runs only while in frame and for `settle` seconds after the moving cursor last
    // passed near it; otherwise its state is left as it is and the draw keeps reading it.
    const passes = (centre: Vec3, radius: number) => {
      const rel = sub(centre, near);
      const along = rel[0] * rayDir[0] + rel[1] * rayDir[1] + rel[2] * rayDir[2];
      const off = Math.hypot(rel[0] - rayDir[0] * along, rel[1] - rayDir[1] * along, rel[2] - rayDir[2] * along);
      return along > -radius && off < radius;
    };
    const stirring = cursorOn && moving;
    const pool = this.pool;
    if (stirring && pool) {
      for (const id of BODIES) {
        const b = this.bodies[id];
        if (!b.formed || !b.slot?.count || !passes(b.centre, b.radius + 3 * P.car.radius)) continue;
        // One stop holds the state at a time; another stop taking it starts clean.
        if (this.owner !== b.group) {
          if (this.stirred.bodies) resetSimulation(gl, pool);
          this.stirred.bodies = false;
          this.owner = b.group;
        }
        this.awake.bodies = t + P.car.settle;
      }
    }
    if (stirring && smoke.live && passes(smoke.bounds.centre, smoke.bounds.radius + 3 * P.smoke.radius)) {
      this.awake.smoke = t + P.smoke.settle;
    }
    // Displaced smoke grains must be put back as they are unborn and reborn by scrolling.
    if (this.stirred.smoke && smoke.live && smoke.slide !== this.lastSlide) {
      this.awake.smoke = Math.max(this.awake.smoke, t + 0.1);
    }
    if (!warm) this.lastSlide = smoke.slide;
    const owned = BODIES.filter((id) => this.bodies[id].group === this.owner).map((id) => this.bodies[id]);
    // Gone from the ride: start clean next time.
    if (pool && this.stirred.bodies && !owned.some((b) => b.formed)) {
      resetSimulation(gl, pool);
      this.stirred.bodies = false;
    }
    if (smoke.sim && this.stirred.smoke && !smoke.live) {
      resetSimulation(gl, smoke.sim);
      this.stirred.smoke = false;
    }

    // At most `rate` steps per second whatever the display rate; each step covers the time banked.
    this.simClock += dt;
    const stepDue = this.simClock >= 0.95 / P.rate;
    const simDt = Math.min(this.simClock, P.maxStep);
    if (stepDue) this.simClock = 0;

    const step = (
      src: SimState,
      dst: SimState,
      width: number,
      row: number,
      rows: number,
      count: number,
      data: WebGLTexture[],
      prog: Program,
      cfg: (typeof P)["car" | "smoke"],
      setup: (prog: Program) => void,
    ) => {
      const u = prog.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, row, width, rows);
      gl.useProgram(prog.program);
      const textures = [src.offset, src.velocity, ...data];
      const names = ["uOffset", "uVelocity", "uDataPos", "uDataSeed", "uDataFrame"];
      textures.forEach((tex, i) => {
        gl.activeTexture(gl.TEXTURE3 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(u[names[i]], 3 + i);
      });
      gl.uniform1i(u.uWidth, width);
      gl.uniform1i(u.uCount, count);
      gl.uniform1i(u.uSimBase, row * width);
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
    };
    gl.disable(gl.BLEND);
    if (!this.reduced && !warm && stepDue && pool && t < this.awake.bodies && owned.some((b) => b.drawn)) {
      // Every formed body of the stop steps into the same target, then the state flips once.
      const src = pool.states[pool.read];
      const dst = pool.states[1 - pool.read];
      for (const b of owned) {
        if (!b.formed || !b.inst || !b.slot?.count) continue;
        const rows = Math.min(b.slot.rows, Math.ceil((thinned(b.inst) * b.spec.copies) / pool.width));
        step(src, dst, pool.width, b.slot.row, rows, b.slot.count, b.slot.data, this.simPrograms.body, P.car, (prog) =>
          bodyUniforms(prog, b),
        );
      }
      pool.read = 1 - pool.read;
      this.stirred.bodies = true;
    }
    const smokeSim = smoke.sim;
    if (!this.reduced && !warm && stepDue && smoke.drawn && smokeSim && t < this.awake.smoke) {
      const rows = Math.min(smokeSim.height, Math.ceil(thinned(smoke.inst) / smokeSim.width));
      const src = smokeSim.states[smokeSim.read];
      const dst = smokeSim.states[1 - smokeSim.read];
      step(src, dst, smokeSim.width, 0, rows, smokeSim.count, smokeSim.data, this.simPrograms.smoke, P.smoke, (prog) =>
        emitterUniforms(prog, smoke),
      );
      smokeSim.read = 1 - smokeSim.read;
      this.stirred.smoke = true;
    }
    // The draw reads the state just written; samplers always point at units 3/4 so they never
    // alias a render target.
    const bindState = (prog: Program, sim: { states: [SimState, SimState]; read: number; width: number } | null, base = 0) => {
      const on = Boolean(sim) && !this.reduced;
      gl.uniform1f(prog.u.uSimOn, on ? 1 : 0);
      gl.uniform1f(prog.u.uDt, dt);
      gl.uniform1i(prog.u.uSimOffset, 3);
      gl.uniform1i(prog.u.uSimVelocity, 4);
      gl.uniform1i(prog.u.uSimBase, base);
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
      gl.uniform2f(u.uCore, T.splat.core, T.splat.coreMinPx * this.dpr);
      gl.uniform1f(u.uCoreShare, T.splat.coreShare);
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
    const stillSetup = (layer: string) => {
      gl.uniform1f(still.u.uFollow, layer === "stars" ? 1 : 0);
      gl.uniform3fv(still.u.uPrevCamPos, this.first ? view.eye : this.prevEye);
      if (layer === "fog") gl.uniform3f(still.u.uDrift, ...T.track.fogDrift);
      else if (layer === "terrain") gl.uniform3f(still.u.uDrift, ...T.track.terrainDrift);
      else gl.uniform3f(still.u.uDrift, 0, 0, 0);
      const nudged = layer === "terrain" && this.nudge > 0.001;
      gl.uniform2f(still.u.uNudge, P.terrain.radius, nudged ? P.terrain.shove * this.nudge : 0);
      gl.uniform3fv(still.u.uRayOrigin, this.nudgeRay[0]);
      gl.uniform3fv(still.u.uRayDir, this.nudgeRay[1]);
    };
    for (const layer of STATIC_LAYERS) {
      common(still, T.layers[layer]);
      stillSetup(layer);
      draw(this.clouds[layer], ADAPTIVE.has(layer) ? thinned(this.clouds[layer]) : undefined);
    }

    // Start lights on the gantry: dim glass until each one comes on, one by one from the moment the
    // ride comes near (all lit under reduced motion).
    const atLive = nearLive(this.ride, p);
    if (!warm) this.lightsSince = atLive ? (this.lightsSince < 0 ? t : this.lightsSince) : -1;
    const gantry = this.bodies.gantry;
    if (this.lamps.length && gantry.drawn) {
      const levels = startLights(this.ride, this.reduced || warm ? Infinity : atLive ? t - this.lightsSince : 0);
      const l = T.live;
      this.lamps.forEach((lamp, i) => {
        common(still, T.layers.lamp);
        stillSetup("lamp");
        const glow = (l.lampOff + (l.lampOn - l.lampOff) * levels[i]) * gantry.form;
        gl.uniform1f(still.u.uIntensity, (T.layers.lamp.intensity * glow) / this.format.decode);
        draw(lamp);
      });
    }

    const smokeProg = this.particle.smoke;
    for (const id of EMITTERS) {
      const e = this.emitters[id];
      if (!e.drawn) continue;
      common(smokeProg, e.look);
      emitterUniforms(smokeProg, e);
      bindState(smokeProg, e.sim);
      draw(e.inst, thinned(e.inst));
    }

    if (bodiesDrawn && this.carTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.carTarget.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const prog = this.particle.body;
      for (const id of BODIES) {
        const b = this.bodies[id];
        if (!b.drawn || !b.inst) continue;
        common(prog, T.layers.car);
        gl.uniform1f(prog.u.uIntensity, (T.layers.car.intensity * b.spec.glow) / this.format.decode);
        // Bodies are never blurred: no bokeh, no far blur.
        gl.uniform4f(prog.u.uDof, focus, 0, 0, 0);
        bodyUniforms(prog, b);
        gl.uniformMatrix4fv(prog.u.uPrevModel, false, this.reduced || warm ? b.model : b.prevModel);
        gl.uniform1f(prog.u.uEdgeBoost, b.spec.edgeBoost);
        const holds = pool && this.owner === b.group && b.slot?.count ? pool : null;
        bindState(prog, holds, holds && b.slot ? b.slot.row * holds.width : 0);
        // Without a simulation the cursor just nudges the grains aside.
        const nudged = !pool && this.nudge > 0.001;
        gl.uniform2f(prog.u.uNudge, P.car.radius, nudged ? P.terrain.shove * this.nudge : 0);
        gl.uniform3fv(prog.u.uRayOrigin, this.nudgeRay[0]);
        gl.uniform3fv(prog.u.uRayDir, this.nudgeRay[1]);
        draw(b.inst, thinned(b.inst) * b.spec.copies);
      }
    }
    gl.bindVertexArray(null);

    if (!warm) this.trail(hdr);
    this.bloomPass(hdr, bodiesDrawn);

    // Bodies join the full-resolution scene after bloom has been taken, so no half-resolution
    // glow is laid over them.
    if (bodiesDrawn && this.carTarget) {
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
    if (prevViewProj) {
      this.prevViewProj.set(prevViewProj);
      return;
    }
    this.composite(hdr, time, t, colour, bodiesDrawn);

    this.prevViewProj.set(this.viewProj);
    for (const id of BODIES) this.bodies[id].prevModel.set(this.bodies[id].model);
    this.prevEye = view.eye;
    this.first = false;
    this.report(time);
  }

  /**
   * One message a frame for the page: camera speed, then while the store stop is near, each floating
   * product's place on screen (NDC x, y), its size at that depth (1 at `refDepth`) and how far it
   * has come out of the dust: [speed, count, x, y, size, form, …].
   */
  private report(time: number) {
    const products = storeProducts(this.ride, this.reduced ? stillFrame(this.ride, this.progress) : this.progress);
    const near = products.some((item) => item.form > 0);
    const data = new Float32Array(2 + (near ? products.length * 4 : 0));
    data[0] = this.speed;
    if (near) {
      const s = T.store;
      const m = this.viewProj;
      const v = this.view;
      data[1] = products.length;
      products.forEach(({ pos, form }, i) => {
        // Slow drift across and up the view, each product on its own beat.
        const a = time * s.drift[2] + i * 1.7;
        const across = Math.sin(a) * s.drift[0];
        const up = Math.sin(a * 1.3 + i * 2.3) * s.drift[1];
        const x = pos[0] + v[0] * across + v[1] * up;
        const y = pos[1] + v[4] * across + v[5] * up;
        const z = pos[2] + v[8] * across + v[9] * up;
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        const o = 2 + i * 4;
        if (w < 0.3) return;
        data[o] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
        data[o + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
        data[o + 2] = s.refDepth / w;
        data[o + 3] = form;
      });
    }
    this.emit({ type: "frame", data });
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

  /**
   * Afterglow: last frame's dust, faded by camera speed, stays wherever it is brighter than this
   * frame's, and the result is kept for the next frame. The bodies join later, so they leave none.
   */
  private trail(hdr: Target) {
    const gl = this.gl;
    const history = this.history!;
    const tr = T.render.trail;
    const fade = this.reduced ? 0 : tr.still + (tr.fast - tr.still) * clamp(this.speed / T.camera.topSpeed, 0, 1);
    if (this.historyValid && fade > 0.001) {
      gl.bindVertexArray(this.screenVao);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      this.fullscreen(this.post.trail, hdr, history.tex, history.width, history.height);
      gl.uniform1f(this.post.trail.u.uFade, fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, hdr.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, history.fbo);
    gl.blitFramebuffer(0, 0, hdr.width, hdr.height, 0, 0, history.width, history.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.historyValid = true;
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

  private composite(hdr: Target, time: number, clock: number, colour: Vec3, bodiesDrawn: boolean) {
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
    gl.uniform1f(prog.u.uBloomGain, r.bloom.strength / this.bloom.length);
    gl.uniform1f(prog.u.uVignette, r.vignette);
    gl.uniform1f(prog.u.uGrain, r.grain);
    gl.uniform1f(prog.u.uTime, time);
    gl.uniform3fv(prog.u.uBackground, this.background);
    this.markUniforms(prog, clock, colour, bodiesDrawn);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** The wordmark under the dust: where it is, how far it has gathered and what covers it. */
  private markUniforms(prog: Program, clock: number, colour: Vec3, bodiesDrawn: boolean) {
    const gl = this.gl;
    const u = prog.u;
    const m = this.mark;
    const state = this.markState;
    const opacity = m ? state.opacity : 0;
    gl.uniform4f(u.uMarkLook, opacity, T.mark.fog, state.fog, m?.slope ?? 0);
    if (!m || opacity <= 0) return;
    const a = T.mark.assemble;
    const [left, top, right, bottom] = state.rect;
    const w = this.canvas.width;
    const h = this.canvas.height;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.carTarget!.tex);
    gl.uniform1i(u.uCar, 2);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.uniform1i(u.uMark, 5);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform4f(u.uMarkRect, left, 1 - bottom, right, 1 - top);
    gl.uniform3fv(u.uMarkColor, colour);
    const since = this.markFrom < 0 || this.reduced ? NEVER : clock - this.markFrom;
    gl.uniform4f(u.uMarkForm, since, a.letter, a.stagger, m.letters - 1);
    const aspect = ((right - left) * w) / Math.max(1, (bottom - top) * h);
    gl.uniform4f(u.uMarkGrain, a.grainPx * this.dpr, a.scatter, a.heat, aspect);
    gl.uniform1fv(u.uMarkCuts, m.cuts);
    const [car, dust, from] = T.mark.cover;
    gl.uniform3f(u.uCover, bodiesDrawn ? car : 0, dust, from);
  }
}
