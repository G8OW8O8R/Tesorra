/** Thin WebGL2 helpers: programs with their uniform locations, render targets, instanced clouds. */

export type Program = {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation>;
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  const u: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, "");
    const loc = gl.getUniformLocation(program, info.name);
    if (loc) u[name] = loc;
  }
  return { program, u };
}

export type TargetFormat = { internal: number; format: number; type: number; decode: number };

/**
 * Half-float targets when the GPU can render to them; otherwise 8-bit targets that
 * store values scaled down by `decode` so bright dust does not clip immediately.
 */
export function pickTargetFormat(gl: WebGL2RenderingContext): TargetFormat {
  if (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")) {
    const probe = createTarget(gl, 4, 4, { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, decode: 1 });
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    deleteTarget(gl, probe);
    if (ok) return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, decode: 1 };
  }
  return { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, decode: 8 };
}

export type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; width: number; height: number };

export function createTarget(gl: WebGL2RenderingContext, width: number, height: number, f: TargetFormat): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, width, height, 0, f.format, f.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, width, height };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target) {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

export type Instances = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number };

/**
 * VAO drawing `count` quads: shared corners at location 0, per-instance xyz at 1, seeds at 2
 * and optional frames (normal + edge weight) at 3. With `divisor` > 1 each entry is reused
 * for that many consecutive instances.
 */
export function createInstances(
  gl: WebGL2RenderingContext,
  corners: WebGLBuffer,
  positions: Float32Array,
  seeds: Float32Array,
  count: number,
  frames?: Float32Array,
  divisor = 1,
): Instances {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const attach = (data: Float32Array, loc: number, size: number) => {
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, divisor);
    return buffer;
  };
  const buffers = [attach(positions, 1, 3), attach(seeds, 2, 4)];
  if (frames) buffers.push(attach(frames, 3, 4));
  gl.bindVertexArray(null);
  return { vao, buffers, count };
}
