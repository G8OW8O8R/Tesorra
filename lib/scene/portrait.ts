import { portraitTuning as T } from "@/lib/scene-tuning";
import { createProgram, createTarget, deleteTarget, pickTargetFormat, type Program, type Target, type TargetFormat } from "./gl";
import type { PortraitEvent, PortraitOptions, PortraitPhoto } from "./portrait-protocol";
import { fullscreenVertex } from "./shaders";

type Surface = HTMLCanvasElement | OffscreenCanvas;

const HASH = /* glsl */ `
float hash(float n) { return fract(sin(n) * 43758.5453123); }
`;

/**
 * The field: grains in a box ahead of the camera drifting on a slow swirl, each with its own hue,
 * brightness and flicker around the dust colour. Near grains blur into soft discs (bokeh) and
 * keep their energy, far ones stay sharp.
 */
const fieldVertex = /* glsl */ `#version 300 es
precision highp float;
uniform float uTime;
uniform float uAspect;
uniform float uHeight;
uniform float uFocal;
uniform vec3 uColour;
uniform vec2 uLook;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uFlow;
uniform vec4 uGrain;
uniform vec4 uTint;
uniform vec2 uShine;
out vec3 vColour;
out float vSoft;
${HASH}
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
void main() {
  float i = float(gl_VertexID);
  vec4 r = vec4(hash(i * 1.137 + 0.11), hash(i * 2.713 + 3.71), hash(i * 0.371 + 9.23), hash(i * 5.191 + 1.37));
  vec4 s = vec4(hash(i * 3.31 + 7.7), hash(i * 0.913 + 2.2), hash(i * 4.77 + 5.5), hash(i * 6.13 + 0.9));
  vec3 p = uBoxMin + r.xyz * uBoxSize;
  float t = uTime * uFlow.z;
  vec3 q = p * uFlow.x;
  p += vec3(
    sin(q.z + t * 1.3) + cos(q.y - t),
    sin(q.x - t * 0.8) + cos(q.z + t * 0.6),
    sin(q.y + t) + cos(q.x + t * 1.1)
  ) * uFlow.y;
  p.xy -= uLook;
  float depth = max(0.2, -p.z);
  float px = uHeight / 1080.0;
  float sharp = max(1.2 * px, uGrain.x * uFocal * 0.5 * uHeight / depth);
  float defocus = max(0.0, 1.0 / depth - 1.0 / uGrain.y) + 0.25 * max(0.0, 1.0 / uGrain.y - 1.0 / depth);
  float blur = min(uGrain.w, defocus * uGrain.z) * px;
  float size = sharp + blur;
  vSoft = blur / size;
  float energy = max(0.04, (sharp * sharp) / (size * size));
  vec3 colour = hueShift(uColour, (r.w - 0.5) * 2.0 * uTint.x);
  float light = mix(uTint.y, uTint.z, s.x);
  if (s.y < uTint.w) {
    colour = mix(colour, vec3(1.0), 0.85);
    light *= 1.6;
  }
  float flicker = 1.0 - uShine.x * 0.5 + uShine.x * 0.5 * sin(uTime * (1.5 + s.z * 4.0) + s.w * 40.0);
  float far = -uBoxMin.z;
  float near = far - uBoxSize.z;
  float fade = (1.0 - smoothstep(far * 0.75, far, depth)) * smoothstep(near, near + 1.5, depth);
  vColour = colour * light * flicker * uShine.y * energy * fade;
  gl_PointSize = size;
  gl_Position = vec4(p.x * uFocal / (depth * uAspect), p.y * uFocal / depth, 0.0, 1.0);
}
`;

const fieldFragment = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColour;
in float vSoft;
out vec4 outColour;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float a = 1.0 - smoothstep(mix(0.55, 0.0, vSoft), 1.0, d);
  outColour = vec4(vColour * a, a);
}
`;

/** Tone maps the field (ACES) and lays it over the page colour with a low haze. */
const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uHdr;
uniform float uExposure;
uniform float uDecode;
uniform vec3 uBg;
uniform vec3 uColour;
uniform vec2 uHaze;
in vec2 vUv;
out vec4 outColour;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 h = texture(uHdr, vUv).rgb * uDecode * uExposure;
  float haze = (1.0 - smoothstep(0.0, uHaze.x, vUv.y)) * uHaze.y;
  vec3 c = aces(h + uColour * haze);
  outColour = vec4(1.0 - (1.0 - uBg) * (1.0 - c), 1.0);
}
`;

/**
 * Photo grains: one a cell of the portrait, coloured from the image. Formed, they are square and
 * cell-sized, so together they are the photo. Each leaves (earlier on the left, with scatter),
 * blown off with the wind and swirling, shrinking into a bright grain and fading; then the grain of
 * the next photo blows in from the other side and settles in its cell.
 */
const photoVertex = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4 uRectA;
uniform vec4 uRectB;
uniform vec4 uCropA;
uniform vec4 uCropB;
uniform vec4 uMaskA;
uniform vec4 uMaskB;
uniform vec2 uLod;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uPhase;
uniform float uTime;
uniform float uAlpha;
uniform float uCore;
uniform vec2 uLeave;
uniform vec2 uLand;
uniform float uFlight;
uniform float uSwirl;
uniform vec2 uWind;
uniform float uDust;
uniform float uGlow;
uniform vec3 uColour;
out vec4 vColour;
out float vRound;
${HASH}
float oval(vec2 g, vec4 m) {
  float d = length((g - m.xy) / m.zw);
  return 1.0 - clamp((d - uCore) / (1.0 - uCore), 0.0, 1.0);
}
void main() {
  int cols = int(uGrid.x);
  vec2 cell = vec2(float(gl_VertexID % cols), float(gl_VertexID / cols));
  vec2 g = (cell + 0.5) / uGrid;
  float i = float(gl_VertexID);
  vec4 s = vec4(hash(i * 1.71 + 0.3), hash(i * 2.37 + 4.1), hash(i * 0.53 + 7.9), hash(i * 3.97 + 2.6));

  float outAt = mix(uLeave.x, uLeave.y, g.x * 0.6 + s.x * 0.4);
  float inAt = max(mix(uLand.x, uLand.y, g.x * 0.6 + s.y * 0.4), outAt + uFlight);
  float a = smoothstep(outAt, outAt + uFlight, uPhase);
  float b = smoothstep(inAt, inAt + uFlight, uPhase);

  vec2 swirl = vec2(
    sin(g.y * 11.0 + s.y * 6.2832 + uTime * 1.7),
    cos(g.x * 9.0 + s.z * 6.2832 + uTime * 1.3)
  ) * uSwirl;
  vec2 gust = (uWind * vec2(1.0 + s.z, 0.6 + s.w) + swirl) * (0.6 + 0.8 * s.w);

  vec2 homeA = vec2(mix(uRectA.x, uRectA.z, g.x), mix(uRectA.y, uRectA.w, g.y));
  vec2 homeB = vec2(mix(uRectB.x, uRectB.z, g.x), mix(uRectB.y, uRectB.w, g.y));
  vec3 colA = textureLod(uTexA, mix(uCropA.xy, uCropA.zw, g), uLod.x).rgb;
  vec3 colB = textureLod(uTexB, mix(uCropB.xy, uCropB.zw, g), uLod.y).rgb;
  vec3 dust = uColour * (1.0 + uGlow);

  vec2 pos;
  vec3 colour;
  float alpha;
  float size;
  float flying;
  if (b > 0.0) {
    float k = 1.0 - b;
    pos = homeB - gust * k * k;
    colour = mix(dust, colB, smoothstep(0.2, 0.9, b));
    alpha = oval(g, uMaskB) * smoothstep(0.0, 0.35, b);
    size = mix(uDust, uCell.y, smoothstep(0.55, 1.0, b));
    flying = 1.0 - smoothstep(0.6, 1.0, b);
  } else {
    pos = homeA + gust * a * a;
    colour = mix(colA, dust, smoothstep(0.05, 0.6, a));
    alpha = oval(g, uMaskA) * (1.0 - smoothstep(0.55, 1.0, a));
    size = mix(uCell.x, uDust, smoothstep(0.0, 0.45, a));
    flying = smoothstep(0.0, 0.3, a);
  }
  alpha *= uAlpha;
  vRound = flying;
  vColour = vec4(colour * alpha, alpha);
  gl_PointSize = size;
  gl_Position = alpha < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(pos, 0.0, 1.0);
}
`;

const photoFragment = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColour;
in float vRound;
out vec4 outColour;
void main() {
  vec2 c = abs(gl_PointCoord * 2.0 - 1.0);
  float d = mix(max(c.x, c.y), length(c), vRound);
  float a = 1.0 - smoothstep(mix(0.98, 0.35, vRound), 1.0, d);
  outColour = vColour * a;
}
`;

type Photo = PortraitPhoto & { tex: WebGLTexture | null; width: number; loading: boolean };

const schedule: (cb: (now: number) => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const unschedule: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

const BG: [number, number, number] = [0x0b / 255, 0x0d / 255, 0x14 / 255];

/**
 * The driver pages' light dust scene: a dimmed field of grains in the driver's colour (no road, no
 * vehicle) with tone mapping over the page colour, and the portrait morph — the photo falls apart
 * into dust and settles as the next one. Runs unchanged in a worker or on the main thread.
 */
export class PortraitEngine {
  static create(canvas: Surface, options: PortraitOptions, emit: (e: PortraitEvent) => void) {
    const gl = (canvas as OffscreenCanvas).getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) {
      emit({ type: "status", status: "unsupported" });
      return null;
    }
    try {
      return new PortraitEngine(canvas, gl, options, emit);
    } catch (error) {
      emit({ type: "status", status: "error", message: String(error) });
      return null;
    }
  }

  private format: TargetFormat;
  private field: Program;
  private composite: Program;
  private photo: Program;
  private vao: WebGLVertexArrayObject;
  private hdr: Target | null = null;
  private photos: Photo[] = [];
  private colour: [number, number, number];
  private target: [number, number, number];
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  /** The running morph: photos, start (ms, null while their images load), end, fade. */
  private morphing: { from: number; to: number; start: number | null; ended: number | null } | null = null;
  private time = 0;
  private last = 0;
  private frame = 0;
  private visible = true;
  private ready = false;
  private disposed = false;

  private constructor(
    private canvas: Surface,
    private gl: WebGL2RenderingContext,
    private options: PortraitOptions,
    private emit: (e: PortraitEvent) => void,
  ) {
    this.format = pickTargetFormat(gl);
    this.field = createProgram(gl, fieldVertex, fieldFragment);
    this.composite = createProgram(gl, fullscreenVertex, compositeFragment);
    this.photo = createProgram(gl, photoVertex, photoFragment);
    this.vao = gl.createVertexArray()!;
    this.colour = [...options.colour];
    this.target = [...options.colour];
    this.resize(options.width, options.height, options.dpr);
    this.last = performance.now();
    this.frame = schedule(this.tick);
  }

  resize(width: number, height: number, dpr: number) {
    this.options = { ...this.options, width, height, dpr };
    this.canvas.width = Math.max(1, width);
    this.canvas.height = Math.max(1, height);
    if (this.hdr) deleteTarget(this.gl, this.hdr);
    this.hdr = createTarget(this.gl, this.canvas.width, this.canvas.height, this.format);
  }

  setColour(rgb: [number, number, number], snap = false) {
    this.target = [...rgb];
    if (snap || this.options.reducedMotion) this.colour = [...rgb];
  }

  setPhotos(list: PortraitPhoto[]) {
    list.forEach((next, i) => {
      const known = this.photos[i];
      if (known && known.url === next.url) {
        Object.assign(known, { rect: next.rect, crop: next.crop, mask: next.mask });
        return;
      }
      if (known?.tex) this.gl.deleteTexture(known.tex);
      const photo: Photo = { ...next, tex: null, width: 1, loading: true };
      this.photos[i] = photo;
      this.load(photo);
    });
  }

  morph(from: number, to: number) {
    // A new switch mid-morph starts from the photo the last one was heading for.
    const start = this.morphing && this.morphing.ended === null ? this.morphing.to : from;
    this.morphing = { from: start, to, start: null, ended: null };
  }

  setPointer(x: number, y: number) {
    this.look.tx = x * T.field.look.x;
    this.look.ty = y * T.field.look.y;
  }

  setReducedMotion(value: boolean) {
    this.options = { ...this.options, reducedMotion: value };
  }

  setVisible(value: boolean) {
    this.visible = value;
    if (value) this.last = performance.now();
  }

  dispose() {
    this.disposed = true;
    unschedule(this.frame);
    const gl = this.gl;
    if (this.hdr) deleteTarget(gl, this.hdr);
    this.photos.forEach((p) => p.tex && gl.deleteTexture(p.tex));
    gl.deleteProgram(this.field.program);
    gl.deleteProgram(this.composite.program);
    gl.deleteProgram(this.photo.program);
    gl.deleteVertexArray(this.vao);
  }

  private async load(photo: Photo) {
    try {
      const response = await fetch(new URL(photo.url, this.options.baseUrl));
      const bitmap = await createImageBitmap(await response.blob(), {
        resizeWidth: T.photo.textureWidth,
        resizeQuality: "medium",
      });
      if (this.disposed || !this.photos.includes(photo)) return bitmap.close();
      const gl = this.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      photo.width = bitmap.width;
      photo.tex = tex;
      bitmap.close();
    } catch {
      // Without its texture the photo cannot morph; the page cross-fades instead.
    } finally {
      photo.loading = false;
    }
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = schedule(this.tick);
    if (!this.visible) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.options.reducedMotion) this.time += dt;

    const blend = 1 - Math.exp((-dt * 3) / T.colourBlend);
    for (let i = 0; i < 3; i++) this.colour[i] += (this.target[i] - this.colour[i]) * blend;
    const follow = 1 - Math.exp(-dt / T.field.look.follow);
    this.look.x += (this.look.tx - this.look.x) * follow;
    this.look.y += (this.look.ty - this.look.y) * follow;

    this.render(now);
    if (!this.ready) {
      this.ready = true;
      this.emit({ type: "status", status: "ready" });
    }
  };

  private render(now: number) {
    const gl = this.gl;
    const hdr = this.hdr!;
    const { width, height } = this.canvas;
    const f = T.field;
    const focal = 1 / Math.tan((50 * Math.PI) / 360);

    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const p = this.field;
    gl.useProgram(p.program);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform1f(p.u.uAspect, width / height);
    gl.uniform1f(p.u.uHeight, height);
    gl.uniform1f(p.u.uFocal, focal);
    gl.uniform3fv(p.u.uColour, this.colour);
    gl.uniform2f(p.u.uLook, this.look.x, this.look.y);
    gl.uniform3f(p.u.uBoxMin, -f.box.x / 2, -f.box.yBelow, -f.box.far);
    gl.uniform3f(p.u.uBoxSize, f.box.x, f.box.yBelow + f.box.yAbove, f.box.far - f.box.near);
    gl.uniform3f(p.u.uFlow, f.flow.scale, f.flow.amp, f.flow.speed);
    gl.uniform4f(p.u.uGrain, f.size, f.focus, f.blur, f.maxBlur);
    gl.uniform4f(p.u.uTint, (f.hue * Math.PI) / 180, f.light[0], f.light[1], f.sparks);
    gl.uniform2f(p.u.uShine, f.flicker, f.gain);
    const count = this.options.mobile ? f.count.mobile : f.count.desktop;
    gl.drawArrays(gl.POINTS, 0, count);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const c = this.composite;
    gl.useProgram(c.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
    gl.uniform1i(c.u.uHdr, 0);
    gl.uniform1f(c.u.uExposure, f.exposure);
    gl.uniform1f(c.u.uDecode, this.format.decode);
    gl.uniform3fv(c.u.uBg, BG);
    gl.uniform3fv(c.u.uColour, this.colour);
    gl.uniform2f(c.u.uHaze, f.haze.height, f.haze.strength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.renderPhoto(now);
    gl.bindVertexArray(null);
  }

  /** The morph runs once both images are in; the grains fade after it ends. */
  private renderPhoto(now: number) {
    const m = this.morphing;
    if (!m) return;
    const a = this.photos[m.from];
    const b = this.photos[m.to];
    if (!a || !b) return;
    if (m.start === null) {
      if (a.loading || b.loading) return;
      if (!a.tex || !b.tex) {
        // An image failed: report the morph done at once so the page shows the next photo.
        this.morphing = null;
        this.emit({ type: "morph", stage: "start" });
        this.emit({ type: "morph", stage: "end" });
        return;
      }
      m.start = now;
      this.emit({ type: "morph", stage: "start" });
    }
    const phase = Math.min(1, (now - m.start) / T.photo.duration);
    if (phase >= 1 && m.ended === null) {
      m.ended = now;
      this.emit({ type: "morph", stage: "end" });
    }
    const alpha = m.ended === null ? 1 : 1 - (now - m.ended) / T.photo.fadeOut;
    if (alpha <= 0) {
      this.morphing = null;
      return;
    }

    const gl = this.gl;
    const { width, height } = this.canvas;
    const mobile = this.options.mobile;
    const cols = mobile ? T.photo.columns.mobile : T.photo.columns.desktop;
    const rect = (r: PortraitPhoto["rect"]) => [r[0] * 2 - 1, 1 - r[1] * 2, r[2] * 2 - 1, 1 - r[3] * 2];
    const boxW = (b.rect[2] - b.rect[0]) * width;
    const boxH = (b.rect[3] - b.rect[1]) * height;
    const rows = Math.max(1, Math.round((cols * boxH) / Math.max(1, boxW)));
    const cell = (photo: Photo) => (((photo.rect[2] - photo.rect[0]) * width) / cols) * 1.08;
    const lod = (photo: Photo) => Math.log2(Math.max(1, (photo.width * (photo.crop[2] - photo.crop[0])) / cols));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const p = this.photo;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(p.u.uTexA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform1i(p.u.uTexB, 1);
    gl.uniform4fv(p.u.uRectA, rect(a.rect));
    gl.uniform4fv(p.u.uRectB, rect(b.rect));
    gl.uniform4fv(p.u.uCropA, a.crop);
    gl.uniform4fv(p.u.uCropB, b.crop);
    gl.uniform4fv(p.u.uMaskA, a.mask);
    gl.uniform4fv(p.u.uMaskB, b.mask);
    gl.uniform2f(p.u.uLod, lod(a), lod(b));
    gl.uniform2f(p.u.uCell, cell(a), cell(b));
    gl.uniform2f(p.u.uGrid, cols, rows);
    gl.uniform1f(p.u.uPhase, phase);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform1f(p.u.uAlpha, Math.min(1, alpha));
    gl.uniform1f(p.u.uCore, T.photo.core);
    gl.uniform2fv(p.u.uLeave, T.photo.leave);
    gl.uniform2fv(p.u.uLand, T.photo.land);
    gl.uniform1f(p.u.uFlight, T.photo.flight);
    gl.uniform1f(p.u.uSwirl, T.photo.swirl);
    gl.uniform2fv(p.u.uWind, T.photo.wind);
    gl.uniform1f(p.u.uDust, T.photo.dust * this.options.dpr);
    gl.uniform1f(p.u.uGlow, T.photo.glow);
    gl.uniform3fv(p.u.uColour, this.colour);
    gl.drawArrays(gl.POINTS, 0, cols * rows);
    gl.disable(gl.BLEND);
  }
}
