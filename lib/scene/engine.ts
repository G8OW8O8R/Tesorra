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
  perspective,
  transformDirection,
  transformPoint,
  type Vec3,
} from "./math";
import { buildSmoke, buildStars, buildTrackClouds, sampleModel, type ModelBounds } from "./particles";
import type { EngineEvent, EngineOptions } from "./protocol";
import {
  bodyVertex,
  ceilingFragment,
  compositeFragment,
  downFragment,
  fullscreenVertex,
  horizonFragment,
  particleFragment,
  prefilterFragment,
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
    this.smoke = make(buildSmoke(counts.smoke, T.smoke.emit));
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
    for (let i = 0; i < n; i++) {
      const pose = slidePose(this.ride, i / (n - 1));
      this.carMatrix(m, pose);
      const ground = carPosition(this.ride, pose)[1];
      const left = transformPoint(m, [T.car.rearAxle, y, -half]);
      const right = transformPoint(m, [T.car.rearAxle, y, half]);
      const forward = transformDirection(m, [1, 0, 0]);
      data.set([...left, ground], i * 4);
      data.set([...right, ground], (n + i) * 4);
      data.set([...forward, 0], (2 * n + i) * 4);
    }
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
    const thinned = (inst: Instances) => Math.max(1, Math.floor(inst.count * this.density));

    const still = this.particle.still;
    for (const layer of STATIC_LAYERS) {
      common(still, T.layers[layer]);
      const follow = layer === "stars" ? 1 : 0;
      gl.uniform1f(still.u.uFollow, follow);
      gl.uniform3fv(still.u.uPrevCamPos, this.first ? view.eye : this.prevEye);
      if (layer === "fog") gl.uniform3f(still.u.uDrift, ...T.track.fogDrift);
      else if (layer === "terrain") gl.uniform3f(still.u.uDrift, ...T.track.terrainDrift);
      else gl.uniform3f(still.u.uDrift, 0, 0, 0);
      draw(this.clouds[layer], ADAPTIVE.has(layer) ? thinned(this.clouds[layer]) : undefined);
    }

    if (pose.slide > 0 && pose.slide < T.smoke.emit[1] + T.smoke.life) {
      const smoke = this.particle.smoke;
      const s = T.smoke;
      common(smoke, T.layers.smoke);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.emitTex);
      gl.uniform1i(smoke.u.uEmit, 2);
      gl.uniform1i(smoke.u.uEmitCount, s.samples);
      gl.uniform1f(smoke.u.uSlide, pose.slide);
      gl.uniform4f(smoke.u.uSmokeA, s.grow, s.spread[0], s.spread[1], s.rise);
      gl.uniform4f(smoke.u.uSmokeB, s.swirl[0], s.swirl[1], s.swirl[2], s.kick);
      gl.uniform2f(smoke.u.uSmokeSize, s.size[0], s.size[1]);
      const carHeight = (this.bounds.max[1] - this.bounds.min[1]) * T.car.scale;
      gl.uniform2f(smoke.u.uSmokeLife, s.life, s.ceiling * carHeight);
      gl.uniform2f(smoke.u.uSmokeFade, s.cameraFade[0], s.cameraFade[1]);
      draw(this.smoke, thinned(this.smoke));
    }

    const intro =
      this.introStart < 0 ? 0 : this.reduced ? 1 : clamp((t - this.introStart) / T.car.intro, 0, 1);
    const form = pose.form * intro;
    this.carMatrix(this.model, pose);
    if (this.first) this.prevModel.set(this.model);
    const carDrawn = Boolean(this.car && form > 0 && this.carTarget);
    if (this.car && carDrawn && this.carTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.carTarget.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const body = this.particle.body;
      const c = T.car;
      common(body, T.layers.car);
      // The body is never blurred: no bokeh, no far blur.
      gl.uniform4f(body.u.uDof, focus, 0, 0, 0);
      gl.uniformMatrix4fv(body.u.uModel, false, this.model);
      gl.uniformMatrix4fv(body.u.uPrevModel, false, this.reduced ? this.model : this.prevModel);
      gl.uniform1f(body.u.uForm, form);
      gl.uniform4f(body.u.uFormShape, c.formSpread, c.formLift, c.formSwirl, c.formDelay);
      gl.uniform1f(body.u.uShimmer, this.reduced ? 0 : c.shimmer);
      gl.uniform1i(body.u.uCopies, c.copies);
      gl.uniform1f(body.u.uSpread, this.carSpacing * c.copySpread);
      gl.uniform1f(body.u.uEdgeBoost, c.edgeBoost);
      gl.uniform1f(body.u.uEdgeTighten, c.edgeTighten);
      draw(this.car, thinned(this.car) * c.copies);
    }
    gl.bindVertexArray(null);

    this.bloomPass(hdr);

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

  private bloomPass(hdr: Target) {
    const gl = this.gl;
    const b = T.render.bloom;
    const { prefilter, down, up } = this.post;
    gl.bindVertexArray(this.screenVao);
    gl.disable(gl.BLEND);

    this.fullscreen(prefilter, this.bloom[0], hdr.tex, hdr.width, hdr.height);
    gl.uniform4f(prefilter.u.uThreshold, b.threshold, b.knee, this.format.decode, 1 / this.format.decode);
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
