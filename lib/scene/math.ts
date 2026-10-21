/** Small vector/matrix helpers for the scene. Matrices are column-major, as WebGL expects. */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, rate: number, dt: number) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function mat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function perspective(out: Mat4, fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** View matrix looking from `eye` at `target`, rolled around the view axis. */
export function lookAt(out: Mat4, eye: Vec3, target: Vec3, roll = 0) {
  const f = normalize(sub(target, eye));
  const r = normalize(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const rx: Vec3 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
  const ux: Vec3 = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
  out[0] = rx[0];
  out[4] = rx[1];
  out[8] = rx[2];
  out[12] = -dot(rx, eye);
  out[1] = ux[0];
  out[5] = ux[1];
  out[9] = ux[2];
  out[13] = -dot(ux, eye);
  out[2] = -f[0];
  out[6] = -f[1];
  out[10] = -f[2];
  out[14] = dot(f, eye);
  out[3] = out[7] = out[11] = 0;
  out[15] = 1;
  return out;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
  }
  return out;
}

/**
 * Model matrix for a body whose forward axis is +X and up is +Y:
 * translate · yaw (about Y) · pitch (about Z, nose up) · roll (about X, top towards +Z) · uniform scale.
 */
export function bodyMatrix(out: Mat4, pos: Vec3, yaw: number, pitch: number, roll: number, s: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // Rows of Ry · Rz · Rx.
  const m00 = cy * cp;
  const m01 = -cy * sp * cr + sy * sr;
  const m02 = cy * sp * sr + sy * cr;
  const m10 = sp;
  const m11 = cp * cr;
  const m12 = -cp * sr;
  const m20 = -sy * cp;
  const m21 = sy * sp * cr + cy * sr;
  const m22 = -sy * sp * sr + cy * cr;
  out[0] = m00 * s;
  out[1] = m10 * s;
  out[2] = m20 * s;
  out[3] = 0;
  out[4] = m01 * s;
  out[5] = m11 * s;
  out[6] = m21 * s;
  out[7] = 0;
  out[8] = m02 * s;
  out[9] = m12 * s;
  out[10] = m22 * s;
  out[11] = 0;
  out[12] = pos[0];
  out[13] = pos[1];
  out[14] = pos[2];
  out[15] = 1;
  return out;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export function transformDirection(m: Mat4, p: Vec3): Vec3 {
  return normalize([
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
  ]);
}

/** Seeded PRNG (mulberry32) so the dust looks the same on every visit. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-7);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** sRGB hex → linear RGB. */
export function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
}

/** sRGB hex → sRGB 0..1 (for blending in display space). */
export function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** General 4×4 inverse (cofactor expansion); returns false if the matrix is singular. */
export function invert(out: Mat4, m: Mat4) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return false;
  const k = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * k;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * k;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * k;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * k;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * k;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * k;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * k;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * k;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * k;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * k;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * k;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * k;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * k;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * k;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * k;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * k;
  return true;
}
