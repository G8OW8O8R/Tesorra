import { sceneTuning } from "@/lib/scene-tuning";

/**
 * GLSL for the dust scene. Particles are instanced quads: each one is projected,
 * sized by depth, widened by depth of field and stretched along its on-screen motion
 * since the last frame, then splatted additively into a half-float buffer.
 */

const SWIRL = /* glsl */ `
vec3 hash3(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

vec3 abc(vec3 p) {
  return vec3(sin(p.z) + cos(p.y), sin(p.x) + cos(p.z), sin(p.y) + cos(p.x));
}

// Two octaves of an Arnold-Beltrami-Childress flow. The field is its own curl, so it is
// divergence-free: advected dust curls and folds instead of bunching up or thinning out.
const mat3 ROT = mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6);
vec3 swirl(vec3 p, float t) {
  vec3 v = abc(p + vec3(t, t * 0.7, -t * 0.5));
  v += 0.5 * (transpose(ROT) * abc(ROT * p * 2.1 + vec3(-t * 1.3, t, t * 0.6)));
  return v;
}
`;

// Cursor trail: grains near any remembered cursor ray move away from it at right angles,
// falling off smoothly with distance, with a little swirl so they part like sand. Weights fade
// on the CPU, so the furrow closes up again without any per-particle state.
const POINTER = /* glsl */ `
#define TRAIL ${sceneTuning.pointer.trail}
uniform vec4 uTrailOrigin[TRAIL];
uniform vec4 uTrailRay[TRAIL];
uniform vec4 uTrailPush[TRAIL];
uniform vec4 uPointer;

vec3 pointerOffset(vec3 p) {
  vec3 offset = vec3(0.0);
  if (uPointer.x <= 0.0) return offset;
  for (int i = 0; i < TRAIL; i++) {
    float w = uTrailOrigin[i].w;
    if (w <= 0.0) continue;
    vec3 dir = uTrailRay[i].xyz;
    vec3 rel = p - uTrailOrigin[i].xyz;
    float along = dot(rel, dir);
    if (along <= 0.0) continue;
    vec3 perp = rel - dir * along;
    float dist = length(perp);
    float k = w * (1.0 - smoothstep(0.0, uPointer.x, dist));
    if (k <= 0.0) continue;
    vec3 away = dist > 1e-4 ? perp / dist : normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + 1e-4);
    offset += away * k * uPointer.y;
    offset += swirl(p * 3.0, uTime * 1.5) * k * uPointer.z;
    offset += uTrailPush[i].xyz * along * k * uPointer.w;
  }
  return offset;
}
`;

const PARTICLE_HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aPos;
layout(location = 2) in vec4 aSeed;

uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uPrevViewProj;
uniform vec3 uCamPos;
uniform vec2 uViewport;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uWhite;
uniform float uSize;
uniform float uIntensity;
uniform float uWhiteMix;
uniform float uHueJitter;
uniform vec2 uValue;
uniform vec2 uSpark;
uniform vec2 uTwinkle;
uniform vec4 uDof;
uniform vec2 uBokeh;
uniform float uSharpPx;
uniform vec4 uLimits;
uniform vec3 uStreak;
uniform vec3 uAtmos;

out vec3 vColor;
out vec2 vLocal;
out float vHalf;
out float vSoft;

${SWIRL}
${POINTER}
`;

const PARTICLE_MAIN = /* glsl */ `
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  float sizeMul = 1.0;
  float alphaMul = 1.0;
  float whiteMix = uWhiteMix;
  vec3 prevWorld;
  vec3 world = particleWorld(prevWorld, sizeMul, alphaMul, whiteMix);

  vec4 viewPos = uView * vec4(world, 1.0);
  float depth = -viewPos.z;
  if (alphaMul <= 0.001 || depth < uLimits.w) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vLocal = vec2(0.0);
    vHalf = 0.0;
    vSoft = 0.0;
    return;
  }

  vec4 clip = uProj * viewPos;
  vec2 ndc = clip.xy / clip.w;
  vec4 prevClip = uPrevViewProj * vec4(prevWorld, 1.0);
  vec2 prevNdc = prevClip.w > 0.0 ? prevClip.xy / prevClip.w : ndc;
  vec2 halfVp = 0.5 * uViewport;

  // Radius in pixels, capped so close dust stays a fine point; sub-pixel particles keep a
  // minimum size and dim instead.
  float r = min(uSize * sizeMul * uProj[1][1] * halfVp.y / depth, uSharpPx);
  float energy = 1.0;
  if (r < uLimits.x) {
    energy *= pow(r / uLimits.x, uLimits.z);
    r = uLimits.x;
  }

  // Depth of field: the circle of confusion widens the splat and spreads its energy. Near blur
  // only opens for a small share of particles right in front of the lens.
  float lens = step(fract(aSeed.x * 91.7 + aSeed.w * 37.3), uBokeh.x) * (1.0 - smoothstep(0.5 * uBokeh.y, uBokeh.y, depth));
  float focus = uDof.x;
  float coc = uViewport.y * (depth < focus ? uDof.y * lens : uDof.z) * abs(depth - focus) / depth;
  float blurred = sqrt(r * r + coc * coc);
  energy *= (r * r) / (blurred * blurred);
  float soft = clamp(coc / blurred, 0.0, 1.0);
  r = min(blurred, uLimits.y);

  // Motion streak along the on-screen movement since the last frame.
  vec2 motion = (ndc - prevNdc) * halfVp;
  float moved = length(motion);
  float halfLen = 0.5 * min(moved * uStreak.x, uStreak.y);
  vec2 dir = moved > 1e-4 ? motion / moved : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  energy *= r / (r + halfLen);

  vec2 centre = ndc * halfVp - dir * halfLen * (2.0 * uStreak.z - 1.0);
  vec2 offset = dir * aCorner.x * (r + halfLen) + perp * aCorner.y * r;
  gl_Position = vec4((centre + offset) / halfVp, 0.0, 1.0);
  vLocal = vec2(aCorner.x * (r + halfLen) / r, aCorner.y);
  vHalf = halfLen / r;
  vSoft = soft;

  vec3 c = max(hueRotate(uColor, (aSeed.x * 2.0 - 1.0) * uHueJitter), 0.0);
  c *= mix(uValue.x, uValue.y, aSeed.y);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, uWhite * luma / dot(uWhite, vec3(0.2126, 0.7152, 0.0722)), whiteMix);
  c = mix(c, uWhite * uSpark.y, step(aSeed.z, uSpark.x));
  float twinkle = 1.0 + uTwinkle.x * sin(uTime * uTwinkle.y * (0.6 + aSeed.w) + aSeed.x * 61.0);
  float atmos = smoothstep(uLimits.w, uLimits.w + uAtmos.x, depth) * exp(-max(depth - uAtmos.y, 0.0) * uAtmos.z);
  vColor = c * uIntensity * energy * alphaMul * twinkle * atmos;
}
`;

function particleVertex(body: string) {
  return PARTICLE_HEAD + body + PARTICLE_MAIN;
}

/** Track, edges, ground, fog and stars: fixed positions, optional camera-follow and churn. */
export const staticVertex = particleVertex(/* glsl */ `
uniform vec3 uPrevCamPos;
uniform float uFollow;
uniform vec3 uDrift;

vec3 particleWorld(out vec3 prevWorld, inout float sizeMul, inout float alphaMul, inout float whiteMix) {
  vec3 p = aPos;
  if (uDrift.x > 0.0) p += swirl(aPos * uDrift.y, uTime * uDrift.z) * uDrift.x;
  sizeMul = mix(0.6, 1.4, fract(aSeed.x * 7.31 + aSeed.y * 3.17));
  vec3 shove = pointerOffset(p);
  prevWorld = p + shove + uPrevCamPos * uFollow;
  return p + shove + uCamPos * uFollow;
}
`);

/**
 * Vehicle point cloud: assembles from scattered dust with per-particle delays and swirl.
 * Each model point is drawn `uCopies` times (attribute divisor); copies after the first are
 * jittered across the local surface plane, so the body fills in without a bigger file.
 * Points on edges and creases (aFrame.w) glow brighter and are jittered less.
 */
export const bodyVertex = particleVertex(/* glsl */ `
layout(location = 3) in vec4 aFrame;

uniform mat4 uModel;
uniform mat4 uPrevModel;
uniform float uForm;
uniform vec4 uFormShape;
uniform float uShimmer;
uniform int uCopies;
uniform float uSpread;
uniform float uEdgeBoost;
uniform float uEdgeTighten;

vec3 particleWorld(out vec3 prevWorld, inout float sizeMul, inout float alphaMul, inout float whiteMix) {
  float copy = float(gl_InstanceID % uCopies);
  vec3 n = normalize(aFrame.xyz + vec3(0.0, 1e-5, 0.0));
  vec3 t1 = normalize(cross(n, abs(n.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(n, t1);
  vec3 j = hash3(aSeed.xy * 31.0 + copy * 7.13) * 2.0 - 1.0;
  // Normals are unreliable on edges, so copies there stay tight to keep the edge crisp.
  float spread = uSpread * (1.0 - uEdgeTighten * aFrame.w);
  vec3 target = aPos + step(0.5, copy) * (t1 * j.x + t2 * j.y + n * j.z * 0.2) * spread;

  vec3 h = hash3(aSeed.xy * 17.0 + copy * 3.7);
  float t = clamp((uForm - h.x * uFormShape.w) / (1.0 - uFormShape.w), 0.0, 1.0);
  float e = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
  vec3 dir = normalize(h * 2.0 - 1.0 + vec3(0.0, 0.0, 1e-3));
  vec3 scatter = target + dir * uFormShape.x * (0.4 + h.y) + vec3(0.0, uFormShape.y * h.z, 0.0);
  vec3 local = mix(scatter, target, e);
  local += swirl(target * 2.5, uTime * 0.6) * (uFormShape.z * (1.0 - e) + uShimmer);
  alphaMul = smoothstep(0.0, 0.35, t) * mix(0.4, 1.0, e) * (1.0 + uEdgeBoost * aFrame.w);
  whiteMix = mix(whiteMix, 0.0, 1.0 - e);
  sizeMul = mix(0.8, 1.2, h.z);
  vec3 world = (uModel * vec4(local, 1.0)).xyz;
  vec3 shove = pointerOffset(world);
  prevWorld = (uPrevModel * vec4(local, 1.0)).xyz + shove;
  return world + shove;
}
`);

/**
 * Tyre smoke without state: a particle's birth is a point on the slide, so whether it exists,
 * where it started and how far it has grown all follow from scroll progress. Time only churns it.
 */
export const smokeVertex = particleVertex(/* glsl */ `
uniform highp sampler2D uEmit;
uniform int uEmitCount;
uniform float uSlide;
uniform vec4 uSmokeA;
uniform vec4 uSmokeB;
uniform vec2 uSmokeSize;
uniform vec2 uSmokeLife;
uniform vec2 uSmokeFade;

vec4 emitter(int row, float b) {
  float x = clamp(b, 0.0, 1.0) * float(uEmitCount - 1);
  int i = int(floor(x));
  int j = min(i + 1, uEmitCount - 1);
  return mix(texelFetch(uEmit, ivec2(i, row), 0), texelFetch(uEmit, ivec2(j, row), 0), x - float(i));
}

vec3 particleWorld(out vec3 prevWorld, inout float sizeMul, inout float alphaMul, inout float whiteMix) {
  float birth = aPos.x;
  float age = uSlide - birth;
  prevWorld = vec3(0.0);
  if (age <= 0.0) {
    alphaMul = 0.0;
    return vec3(0.0);
  }
  float e = clamp(age / uSmokeA.x, 0.0, 1.0);
  float grow = 1.0 - (1.0 - e) * (1.0 - e);
  vec4 origin = emitter(int(aPos.y), birth);
  vec3 back = emitter(2, birth).xyz;

  vec3 h = hash3(aSeed.xy * 23.0);
  vec3 dir = normalize(hash3(aSeed.zw * 19.0) * 2.0 - 1.0 + vec3(0.0, 1e-3, 0.0));
  float radius = mix(uSmokeA.y, uSmokeA.z, grow) * pow(h.x, 0.333);
  vec3 p = origin.xyz + dir * radius - back * uSmokeB.w * grow;
  p.y += uSmokeA.w * grow * (0.3 + h.y);
  float amp = uSmokeB.x * grow / 3.0;
  for (int k = 0; k < 3; k++) p += swirl(p * uSmokeB.y, uTime * uSmokeB.z) * amp;

  // Soft ceiling above the road: height passes through up to 70% of it, then flattens out.
  float ceiling = uSmokeLife.y;
  float above = p.y - origin.w;
  float knee = 0.7 * ceiling;
  if (above > knee) above = knee + (ceiling - knee) * (1.0 - exp(-(above - knee) / (ceiling - knee)));
  p.y = origin.w + max(above, 0.03);

  sizeMul = mix(uSmokeSize.x, uSmokeSize.y, grow) * mix(0.7, 1.3, h.z);
  alphaMul = smoothstep(0.0, 0.06, e) * (1.0 - 0.4 * grow);
  alphaMul *= 1.0 - smoothstep(0.55 * uSmokeLife.x, uSmokeLife.x, age);
  alphaMul *= smoothstep(uSmokeFade.x, uSmokeFade.y, distance(p, uCamPos));
  p += pointerOffset(p);
  prevWorld = p;
  return p;
}
`);

export const particleFragment = /* glsl */ `#version 300 es
precision highp float;

in vec3 vColor;
in vec2 vLocal;
in float vHalf;
in float vSoft;
out vec4 outColor;

void main() {
  // Capsule distance: a round splat, or a streak when stretched.
  vec2 q = vec2(max(abs(vLocal.x) - vHalf, 0.0), vLocal.y);
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  float spark = exp(-d2 * 4.0) * 1.3;
  float bokeh = (1.0 - smoothstep(0.55, 1.0, sqrt(d2))) * 0.53;
  outColor = vec4(vColor * mix(spark, bokeh, vSoft), 1.0);
}
`;

/**
 * Sky behind the horizon, drawn into the HDR buffer before the dust: a wide soft glow in the
 * chapter colour centred on the track far ahead, and a thin cool haze along the horizon.
 */
export const horizonFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uEye;
uniform vec3 uGlowColor;
uniform vec4 uGlow;
uniform vec2 uGlowDir;
uniform vec3 uHazeColor;
uniform vec3 uHaze;
uniform float uEncode;
out vec4 outColor;
void main() {
  vec4 far = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 ray = normalize(far.xyz / far.w - uEye);
  float e = ray.y;
  float band = e > 0.0 ? exp(-e / uGlow.y) : exp(e / uGlow.z);
  float facing = dot(normalize(ray.xz + vec2(1e-5)), uGlowDir);
  float glow = uGlow.x * band * exp(-(1.0 - facing) / uGlow.w);
  float haze = uHaze.x * exp(-abs(e + uHaze.z) / uHaze.y);
  outColor = vec4((uGlowColor * glow + uHazeColor * haze) * uEncode, 1.0);
}
`;

/** Folds the car's own buffer into the scene with a soft ceiling, so dense panels keep their shape. */
export const ceilingFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uCeiling;
out vec4 outColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * uCeiling.y;
  float m = max(c.r, max(c.g, c.b));
  float k = m > 1e-5 ? uCeiling.x * (1.0 - exp(-m / uCeiling.x)) / m : 1.0;
  outColor = vec4(c * k / uCeiling.y, 1.0);
}
`;

export const fullscreenVertex = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Soft-threshold prefilter into the first bloom level, with Karis weighting against fireflies. */
export const prefilterFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec4 uThreshold;
out vec4 outColor;

vec3 tap(vec2 o, inout float wsum) {
  vec3 c = texture(uSrc, vUv + o * uTexel).rgb * uThreshold.z;
  float w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
  wsum += w;
  return c * w;
}

void main() {
  float wsum = 0.0;
  vec3 c = tap(vec2(-1.0, -1.0), wsum) + tap(vec2(1.0, -1.0), wsum) + tap(vec2(-1.0, 1.0), wsum) + tap(vec2(1.0, 1.0), wsum);
  c /= wsum;
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold.y;
  float soft = clamp(br - uThreshold.x + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold.x) / max(br, 1e-4);
  outColor = vec4(c * w * uThreshold.w, 1.0);
}
`;

export const downFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 outColor;
void main() {
  vec3 s = texture(uSrc, vUv).rgb * 4.0;
  s += texture(uSrc, vUv - uTexel).rgb;
  s += texture(uSrc, vUv + uTexel).rgb;
  s += texture(uSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  s += texture(uSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  outColor = vec4(s / 8.0, 1.0);
}
`;

export const upFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 outColor;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 s = texture(uSrc, vUv + vec2(-2.0 * o.x, 0.0)).rgb;
  s += texture(uSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(0.0, 2.0 * o.y)).rgb;
  s += texture(uSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(2.0 * o.x, 0.0)).rgb;
  s += texture(uSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(0.0, -2.0 * o.y)).rgb;
  s += texture(uSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  outColor = vec4(s / 12.0, 1.0);
}
`;

/** HDR + bloom → exposure → ACES → sRGB, laid over the page background, plus grain. */
export const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uDecode;
uniform float uExposure;
uniform float uBloomGain;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec3 uBackground;
out vec4 outColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 hdr = texture(uScene, vUv).rgb * uDecode;
  vec3 bloom = texture(uBloom, vUv).rgb * uDecode;
  vec3 c = (hdr + bloom * uBloomGain) * uExposure;
  vec2 v = vUv - 0.5;
  c *= 1.0 - uVignette * dot(v, v) * 2.0;
  c = toSrgb(aces(c));
  c = 1.0 - (1.0 - c) * (1.0 - uBackground);
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
  outColor = vec4(c + (n - 0.5) * uGrain, 1.0);
}
`;
