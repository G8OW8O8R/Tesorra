import type { TargetFormat } from "./gl";

/** One side of the ping-pong: per-instance offset from rest and velocity (xyz each). */
export type SimState = { fbo: WebGLFramebuffer; offset: WebGLTexture; velocity: WebGLTexture };

/**
 * GPU particle state, one texel per drawn instance. Each frame a fragment shader reads one
 * state and writes the other; `data` holds the per-entry inputs (position, seeds, frames) the
 * shader needs to recompute every grain's rest position, laid out at the same width.
 */
export type Simulation = {
  width: number;
  height: number;
  count: number;
  states: [SimState, SimState];
  read: number;
  data: WebGLTexture[];
};

function texture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  f: TargetFormat | null,
  data: Float32Array | null,
  half = false,
) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (f) gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * @param count   simulated instances (texels)
 * @param entries per-entry inputs, each `size` floats per entry (padded to RGBA texels); `half`
 *                stores them at half precision, for values that tolerate it (hash seeds do not)
 */
export function createSimulation(
  gl: WebGL2RenderingContext,
  format: TargetFormat,
  count: number,
  maxWidth: number,
  entries: { values: Float32Array; size: number; half?: boolean }[],
): Simulation {
  const width = Math.min(maxWidth, Math.max(1, count));
  const height = Math.ceil(count / width);
  const state = (): SimState => {
    const offset = texture(gl, width, height, format, null);
    const velocity = texture(gl, width, height, format, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, offset, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, velocity, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    return { fbo, offset, velocity };
  };
  const data = entries.map(({ values, size, half }) => {
    const n = Math.floor(values.length / size);
    const rows = Math.max(1, Math.ceil(n / width));
    const padded = new Float32Array(width * rows * 4);
    for (let e = 0; e < n; e++) {
      for (let k = 0; k < size; k++) padded[e * 4 + k] = values[e * size + k];
    }
    return texture(gl, width, rows, null, padded, half);
  });
  const sim: Simulation = { width, height, count, states: [state(), state()], read: 0, data };
  resetSimulation(gl, sim);
  return sim;
}

/** Puts every grain back at rest. */
export function resetSimulation(gl: WebGL2RenderingContext, sim: Simulation) {
  gl.clearColor(0, 0, 0, 0);
  for (const s of sim.states) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
