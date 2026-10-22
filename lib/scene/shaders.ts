/**
 * GLSL for the dust scene. Particles are instanced quads: each one is projected,
 * sized by depth, widened by depth of field and stretched along its on-screen motion
 * since the last frame, then splatted additively into a half-float buffer.
 * The car and the smoke also carry a simulated offset (spring back to rest, kicked by the cursor),
 * stepped on the GPU in ping-pong textures; their rest positions come from shared functions so
 * the simulation and the draw agree exactly.
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

/** Rest position of a body grain (expects uTime and the SWIRL helpers). */
const BODY = /* glsl */ `
uniform mat4 uModel;
uniform float uForm;
uniform vec4 uFormShape;
uniform float uShimmer;
uniform int uCopies;
uniform float uSpread;
uniform float uEdgeTighten;

// Model-space position of one body grain: a copy of its model point jittered across the local
// surface (less on edges, where normals are unreliable), flown in from scattered dust while the
// body assembles. t is the grain's own assembly time, e its eased form.
vec3 bodyLocal(vec3 pos, vec4 seed, vec4 frame, float copy, out float t, out float e) {
  vec3 n = normalize(frame.xyz + vec3(0.0, 1e-5, 0.0));
  vec3 t1 = normalize(cross(n, abs(n.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(n, t1);
  vec3 j = hash3(seed.xy * 31.0 + copy * 7.13) * 2.0 - 1.0;
  float spread = uSpread * (1.0 - uEdgeTighten * frame.w);
  vec3 target = pos + step(0.5, copy) * (t1 * j.x + t2 * j.y + n * j.z * 0.2) * spread;

  vec3 h = hash3(seed.xy * 17.0 + copy * 3.7);
  t = clamp((uForm - h.x * uFormShape.w) / (1.0 - uFormShape.w), 0.0, 1.0);
  e = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
  vec3 dir = normalize(h * 2.0 - 1.0 + vec3(0.0, 0.0, 1e-3));
  vec3 scatter = target + dir * uFormShape.x * (0.4 + h.y) + vec3(0.0, uFormShape.y * h.z, 0.0);
  vec3 local = mix(scatter, target, e);
  return local + swirl(target * 2.5, uTime * 0.6) * (uFormShape.z * (1.0 - e) + uShimmer);
}
`;

/**
 * Rest position of a smoke grain (expects uTime, uCamPos and the SWIRL helpers). A grain's birth
 * is a point on the slide, so whether it exists, where it started and how far it has grown all
 * follow from scroll progress; time only churns it.
 * With uBurn.x > 0 (burnout smoke) grains run on a clock instead: each lives uBurn.x seconds and is
 * born again at the wheels, only between uBurn.y and uBurn.z; the emitter path is then the car's
 * entrance, which starts at uBurn.w and lasts uBurnDrive seconds.
 */
const SMOKE = /* glsl */ `
uniform highp sampler2D uEmit;
uniform int uEmitCount;
uniform float uSlide;
uniform vec4 uSmokeA;
uniform vec4 uSmokeB;
uniform vec2 uSmokeSize;
uniform vec2 uSmokeLife;
uniform vec2 uSmokeFade;
uniform float uSmokeStreak;
uniform vec4 uBurn;
uniform float uBurnDrive;

// Set by smokeWorld: the emitter's backward direction and how far the grain has grown.
vec3 smokeBack;
float smokeGrowth;

vec4 emitter(int row, float b) {
  float x = clamp(b, 0.0, 1.0) * float(uEmitCount - 1);
  int i = int(floor(x));
  int j = min(i + 1, uEmitCount - 1);
  return mix(texelFetch(uEmit, ivec2(i, row), 0), texelFetch(uEmit, ivec2(j, row), 0), x - float(i));
}

// pos = (birth along the slide, wheel 0/1, unused). alpha is 0 before the grain is born.
vec3 smokeWorld(vec3 pos, vec4 seed, out float alpha, out float size) {
  float birth = pos.x;
  float age = uSlide - birth;
  if (uBurn.x > 0.0) {
    float phase = fract(birth + uTime / uBurn.x);
    float born = uTime - phase * uBurn.x;
    age = born < uBurn.y || born > uBurn.z ? -1.0 : max(phase * uSmokeLife.x, 1e-4);
    birth = clamp((born - uBurn.w) / uBurnDrive, 0.0, 1.0);
  }
  alpha = 0.0;
  size = 1.0;
  smokeBack = vec3(0.0);
  smokeGrowth = 1.0;
  if (age <= 0.0) return vec3(0.0);
  float e = clamp(age / uSmokeA.x, 0.0, 1.0);
  float grow = 1.0 - (1.0 - e) * (1.0 - e);
  vec4 origin = emitter(int(pos.y), birth);
  vec3 back = emitter(2, birth).xyz;
  smokeBack = back;
  smokeGrowth = grow;

  vec3 h = hash3(seed.xy * 23.0);
  vec3 dir = normalize(hash3(seed.zw * 19.0) * 2.0 - 1.0 + vec3(0.0, 1e-3, 0.0));
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

  size = mix(uSmokeSize.x, uSmokeSize.y, grow) * mix(0.7, 1.3, h.z);
  alpha = smoothstep(0.0, 0.06, e) * (1.0 - 0.4 * grow);
  alpha *= 1.0 - smoothstep(0.55 * uSmokeLife.x, uSmokeLife.x, age);
  alpha *= smoothstep(uSmokeFade.x, uSmokeFade.y, distance(p, uCamPos));
  return p;
}
`;

/** Simulated offset and velocity of this instance, read by the draw. */
const STATE = /* glsl */ `
uniform highp sampler2D uSimOffset;
uniform highp sampler2D uSimVelocity;
uniform int uSimWidth;
uniform int uSimBase;
uniform float uSimOn;
uniform float uDt;

// Bodies sharing one state texture each own a block of rows starting at texel uSimBase.
void simState(int id, out vec3 offset, out vec3 velocity) {
  offset = vec3(0.0);
  velocity = vec3(0.0);
  if (uSimOn <= 0.0) return;
  id += uSimBase;
  ivec2 px = ivec2(id % uSimWidth, id / uSimWidth);
  offset = texelFetch(uSimOffset, px, 0).xyz;
  velocity = texelFetch(uSimVelocity, px, 0).xyz;
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
uniform vec2 uCore;

out vec3 vColor;
out vec2 vLocal;
out float vHalf;
out float vRadius;
out float vCore;
out float vSoft;

${SWIRL}
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
    vRadius = 1.0;
    vCore = 1.0;
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

  // The sharp core is a share of the radius (never under a minimum); the quad reaches a pixel past
  // it for the antialiased rim and the halo.
  float core = max(r * uCore.x, uCore.y);
  float quad = max(r, core + 1.0);
  vec2 centre = ndc * halfVp - dir * halfLen * (2.0 * uStreak.z - 1.0);
  vec2 offset = dir * aCorner.x * (quad + halfLen) + perp * aCorner.y * quad;
  gl_Position = vec4((centre + offset) / halfVp, 0.0, 1.0);
  vLocal = vec2(aCorner.x * (quad + halfLen), aCorner.y * quad);
  vHalf = halfLen;
  vRadius = r;
  vCore = core;
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

/** Grains near the cursor ray pushed aside with a Gaussian falloff, without state. */
const NUDGE = /* glsl */ `
uniform vec2 uNudge;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;

vec3 nudge(vec3 p) {
  vec3 rel = p - uRayOrigin;
  float along = dot(rel, uRayDir);
  if (along <= 0.0) return vec3(0.0);
  vec3 perp = rel - uRayDir * along;
  float dist = length(perp);
  float r = dist / uNudge.x;
  if (r > 3.0 || dist < 1e-4) return vec3(0.0);
  return perp / dist * uNudge.y * exp(-2.0 * r * r);
}
`;

/**
 * Track, edges, terrain, fog and stars: fixed positions, optional camera-follow and churn.
 * Terrain grains near the cursor ray are nudged aside.
 */
export const staticVertex = particleVertex(/* glsl */ `
uniform vec3 uPrevCamPos;
uniform float uFollow;
uniform vec3 uDrift;
${NUDGE}

vec3 particleWorld(out vec3 prevWorld, inout float sizeMul, inout float alphaMul, inout float whiteMix) {
  vec3 p = aPos;
  if (uDrift.x > 0.0) p += swirl(aPos * uDrift.y, uTime * uDrift.z) * uDrift.x;
  if (uNudge.y > 0.0) p += nudge(p);
  sizeMul = mix(0.6, 1.4, fract(aSeed.x * 7.31 + aSeed.y * 3.17));
  prevWorld = p + uPrevCamPos * uFollow;
  return p + uCamPos * uFollow;
}
`);

/**
 * Vehicle point cloud. Each model point is drawn `uCopies` times (attribute divisor); points on
 * edges and creases (aFrame.w) glow brighter. Grains the cursor throws streak along their motion;
 * without the simulation (phones) the cursor only nudges them aside.
 */
export const bodyVertex = particleVertex(/* glsl */ `
layout(location = 3) in vec4 aFrame;

uniform mat4 uPrevModel;
uniform float uEdgeBoost;
${BODY}
${STATE}
${NUDGE}

vec3 particleWorld(out vec3 prevWorld, inout float sizeMul, inout float alphaMul, inout float whiteMix) {
  float copy = float(gl_InstanceID % uCopies);
  float t;
  float e;
  vec3 local = bodyLocal(aPos, aSeed, aFrame, copy, t, e);
  alphaMul = smoothstep(0.0, 0.35, t) * mix(0.4, 1.0, e) * (1.0 + uEdgeBoost * aFrame.w);
  whiteMix = mix(whiteMix, 0.0, 1.0 - e);
  sizeMul = mix(0.8, 1.2, hash3(aSeed.xy * 17.0 + copy * 3.7).z);
  vec3 offset;
  vec3 velocity;
  simState(gl_InstanceID, offset, velocity);
  vec3 world = (uModel * vec4(local, 1.0)).xyz + offset;
  vec3 push = uNudge.y > 0.0 ? nudge(world) : vec3(0.0);
  prevWorld = (uPrevModel * vec4(local, 1.0)).xyz + offset - velocity * uDt + push;
  return world + push;
}
`);

/**
 * Tyre smoke, the formula's wake and the knee sparks: rest position from their run, plus a
 * simulated offset (smoke only). Fresh grains can streak back along the emitter's path.
 */
export const smokeVertex = particleVertex(/* glsl */ `
${SMOKE}
${STATE}

vec3 particleWorld(out vec3 prevWorld, inout float sizeMul, inout float alphaMul, inout float whiteMix) {
  float alpha;
  float size;
  vec3 p = smokeWorld(aPos, aSeed, alpha, size);
  alphaMul = alpha;
  sizeMul = size;
  vec3 offset;
  vec3 velocity;
  simState(gl_InstanceID, offset, velocity);
  prevWorld = p + offset - velocity * uDt + smokeBack * uSmokeStreak * (1.0 - smokeGrowth);
  return p + offset;
}
`);

/**
 * One simulation step per texel (one texel per drawn instance): semi-implicit spring back to
 * rest with damping, a kick from the cursor ray (aside, plus along the cursor's motion, scaled by
 * its speed), and a little curl swirl on moving grains — sand thrown up that settles back.
 */
const SIM_HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform float uTime;
uniform vec3 uCamPos;
uniform sampler2D uOffset;
uniform sampler2D uVelocity;
uniform sampler2D uDataPos;
uniform sampler2D uDataSeed;
uniform int uWidth;
uniform int uCount;
uniform int uSimBase;
uniform float uDt;
uniform vec4 uSpring;
uniform vec4 uCursor;
uniform float uCoupling;
uniform float uDrift;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform vec3 uRayVel;

layout(location = 0) out vec4 outOffset;
layout(location = 1) out vec4 outVelocity;

${SWIRL}

// spring scales the stiffness for this grain (0 = it drifts off and stays there).
void advance(vec3 rest, vec3 offset, vec3 velocity, float spring) {
  vec3 p = rest + offset;
  if (uCursor.x > 0.0) {
    vec3 rel = p - uRayOrigin;
    float along = dot(rel, uRayDir);
    if (along > 0.0) {
      vec3 perp = rel - uRayDir * along;
      float dist = length(perp);
      float r = dist / uCursor.x;
      if (r < 3.0) {
        float fall = exp(-2.0 * r * r);
        vec3 away = dist > 1e-4 ? perp / dist : normalize(cross(uRayDir, vec3(0.0, 1.0, 0.0)) + 1e-4);
        vec3 cursorVelocity = uRayVel * along;
        vec3 target = away * (uCursor.w + length(cursorVelocity) * uCursor.y) + cursorVelocity * uCursor.z;
        velocity += (target - velocity) * fall * (1.0 - exp(-uCoupling * uDt));
      }
    }
  }
  velocity += (-uSpring.x * spring * offset - uSpring.y * velocity) * uDt;
  velocity += swirl(p * 3.0, uTime * 1.5) * uSpring.z * length(velocity) * uDt;
  float speed = length(velocity);
  if (speed > uSpring.w) velocity *= uSpring.w / speed;
  offset += velocity * uDt;
  outOffset = vec4(offset, 0.0);
  outVelocity = vec4(velocity, 0.0);
}
`;

export const bodySimFragment = /* glsl */ `${SIM_HEAD}
${BODY}
uniform sampler2D uDataFrame;

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int id = px.y * uWidth + px.x - uSimBase;
  if (id >= uCount) {
    outOffset = vec4(0.0);
    outVelocity = vec4(0.0);
    return;
  }
  int entry = id / uCopies;
  ivec2 dp = ivec2(entry % uWidth, entry / uWidth);
  float t;
  float e;
  vec3 local = bodyLocal(
    texelFetch(uDataPos, dp, 0).xyz,
    texelFetch(uDataSeed, dp, 0),
    texelFetch(uDataFrame, dp, 0),
    float(id - entry * uCopies),
    t,
    e
  );
  advance((uModel * vec4(local, 1.0)).xyz, texelFetch(uOffset, px, 0).xyz, texelFetch(uVelocity, px, 0).xyz, 1.0);
}
`;

export const smokeSimFragment = /* glsl */ `${SIM_HEAD}
${SMOKE}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int id = px.y * uWidth + px.x;
  float alpha;
  float size;
  vec4 seed = texelFetch(uDataSeed, px, 0);
  vec3 rest = id < uCount ? smokeWorld(texelFetch(uDataPos, px, 0).xyz, seed, alpha, size) : vec3(0.0);
  // Unborn grains (and padding) stay at rest.
  if (id >= uCount || alpha <= 0.0) {
    outOffset = vec4(0.0);
    outVelocity = vec4(0.0);
    return;
  }
  float spring = step(uDrift, fract(seed.z * 13.7 + seed.w * 5.3));
  advance(rest, texelFetch(uOffset, px, 0).xyz, texelFetch(uVelocity, px, 0).xyz, spring);
}
`;

export const particleFragment = /* glsl */ `#version 300 es
precision highp float;

in vec3 vColor;
in vec2 vLocal;
in float vHalf;
in float vRadius;
in float vCore;
in float vSoft;
uniform float uCoreShare;
out vec4 outColor;

const float PI = 3.14159265;

void main() {
  // Capsule distance in pixels: a round splat, or a streak when stretched.
  vec2 q = vec2(max(abs(vLocal.x) - vHalf, 0.0), vLocal.y);
  float d = length(q);
  float r = vRadius;
  float c = vCore;
  float quad = max(r, c + 1.0);
  if (d > quad) discard;
  // A sharp grain is a flat core with a one-pixel antialiased rim plus a soft halo out to the quad's
  // edge, sharing the energy of a grain of radius r (r² once integrated, as the splat always had).
  float rim = 1.0 - smoothstep(c - 0.5, c + 0.5, d);
  float halo = exp(-4.0 * d * d / (quad * quad));
  float e = r * r;
  float sharp = uCoreShare * e * rim / (PI * (c * c + 1.0 / 12.0)) + (1.0 - uCoreShare) * e * halo / (0.771 * quad * quad);
  // Out of focus: an even disc over the whole radius (depth of field only).
  float bokeh = (1.0 - smoothstep(0.55, 1.0, d / r)) * 0.53;
  outColor = vec4(vColor * mix(sharp, bokeh, vSoft), 1.0);
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

/** Last frame's dust, faded, laid over this one with a max blend: moving grains leave an afterglow. */
export const trailFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uFade;
out vec4 outColor;
void main() {
  outColor = vec4(texture(uSrc, vUv).rgb * uFade, 1.0);
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

/**
 * Soft-threshold prefilter into the first bloom level, with Karis weighting against fireflies.
 * The scene and the car (with its own gain) both feed it.
 */
export const prefilterFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uCar;
uniform vec2 uTexel;
uniform vec4 uThreshold;
uniform vec2 uCarBloom;
out vec4 outColor;

// The car buffer under the same soft ceiling as in the scene, scaled by its own bloom gain.
vec3 car(vec2 uv) {
  vec3 c = texture(uCar, uv).rgb * uThreshold.z;
  float m = max(c.r, max(c.g, c.b));
  float k = m > 1e-5 ? uCarBloom.x * (1.0 - exp(-m / uCarBloom.x)) / m : 1.0;
  return c * k * uCarBloom.y;
}

vec3 tap(vec2 o, inout float wsum) {
  vec2 uv = vUv + o * uTexel;
  vec3 c = texture(uSrc, uv).rgb * uThreshold.z + car(uv);
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

/** Letter boundaries the composite takes for the wordmark (one fewer than the letters it tells apart). */
export const MARK_CUTS = 8;

/**
 * HDR + bloom → exposure → ACES → sRGB, laid over the page background, plus grain.
 * The wordmark is part of that background: the dust is screened over it, and where the car or
 * dense dust is it covers the letters. Its lower part fades into the horizon haze. After the
 * intro its letters gather one after another from grains flying in from below.
 */
export const compositeFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uCar;
uniform sampler2D uMark;
uniform float uDecode;
uniform float uExposure;
uniform float uBloomGain;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec3 uBackground;
uniform vec2 uResolution;
// Wordmark: rect in uv (left, bottom, right, top); colour (linear); opacity, fog share of its
// height, fog amount, letter slant; seconds since it began gathering, seconds per letter, delay
// between letters, letters - 1; grain px, scatter (share of its width), heat, aspect (w / h px);
// letter boundaries along the slanted x; and what covers it (car gain, dust gain, dust floor).
uniform vec4 uMarkRect;
uniform vec3 uMarkColor;
uniform vec4 uMarkLook;
uniform vec4 uMarkForm;
uniform vec4 uMarkGrain;
uniform float uMarkCuts[${MARK_CUTS}];
uniform vec3 uCover;
out vec4 outColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Coverage of the wordmark at m (0..1 across its rect, y up); nothing outside it.
float markAt(vec2 m) {
  vec2 inside = step(vec2(0.0), m) * step(m, vec2(1.0));
  return texture(uMark, vec2(m.x, 1.0 - m.y)).r * inside.x * inside.y;
}

// Which letter m falls in, 0 (left) .. 1 (right), along the slant of the letters.
float letterOf(vec2 m) {
  float x = m.x + uMarkLook.w * (0.5 - m.y);
  float n = 0.0;
  for (int i = 0; i < ${MARK_CUTS}; i++) n += step(uMarkCuts[i], x);
  return uMarkForm.w > 0.0 ? min(n, uMarkForm.w) / uMarkForm.w : 0.0;
}

// The wordmark here: sRGB colour and how much of it shows.
vec4 mark() {
  vec2 size = uMarkRect.zw - uMarkRect.xy;
  vec2 m = (vUv - uMarkRect.xy) / size;
  if (uMarkLook.x <= 0.0 || m.x < -0.2 || m.x > 1.2 || m.y < -0.5 || m.y > 1.5) return vec4(0.0);
  float q = clamp((uMarkForm.x - letterOf(clamp(m, 0.0, 1.0)) * uMarkForm.w * uMarkForm.z) / uMarkForm.y, 0.0, 1.0);
  float a = markAt(m);
  float heat = 0.0;
  if (q < 1.0) {
    // Each grain is a small square cell that flies in from below on its own delay.
    vec2 cell = floor(gl_FragCoord.xy / uMarkGrain.x);
    float h1 = hash12(cell);
    float h2 = hash12(cell + 17.31);
    float h3 = hash12(cell + 41.97);
    float e = clamp((q - 0.55 * h1) / 0.45, 0.0, 1.0);
    float k = 1.0 - pow(1.0 - e, 3.0);
    float angle = h2 * 6.2831853;
    vec2 dir = vec2(cos(angle), sin(angle) * uMarkGrain.w) * (0.3 + h3) + vec2(0.0, 0.8 * uMarkGrain.w);
    vec2 centre = ((cell + 0.5) * uMarkGrain.x / uResolution - uMarkRect.xy) / size;
    float grain = step(0.5, markAt(centre + dir * uMarkGrain.y * (1.0 - k))) * step(1e-3, e);
    float settle = smoothstep(0.85, 1.0, q);
    a = mix(grain, a, settle);
    heat = (1.0 - k) * (1.0 - settle);
  }
  float fog = mix(1.0, smoothstep(0.0, uMarkLook.y, m.y), uMarkLook.z);
  vec3 colour = toSrgb(clamp(uMarkColor * (1.0 + heat * uMarkGrain.z), 0.0, 1.0));
  return vec4(colour, a * fog * uMarkLook.x);
}
void main() {
  vec3 hdr = texture(uScene, vUv).rgb * uDecode;
  vec3 bloom = texture(uBloom, vUv).rgb * uDecode;
  vec3 c = (hdr + bloom * uBloomGain) * uExposure;
  vec2 v = vUv - 0.5;
  c *= 1.0 - uVignette * dot(v, v) * 2.0;
  c = toSrgb(aces(c));
  vec3 base = uBackground;
  vec4 word = mark();
  if (word.a > 0.0) {
    float car = luma(texture(uCar, vUv).rgb * uDecode);
    float cover = 1.0 - exp(-uCover.x * car - uCover.y * max(luma(hdr) - uCover.z, 0.0));
    base = mix(base, word.rgb, word.a * (1.0 - cover));
  }
  c = 1.0 - (1.0 - c) * (1.0 - base);
  // Grain only in the dark tones, so the fine dust keeps its edges.
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
  float dark = 1.0 - smoothstep(0.0, 0.3, dot(c, vec3(0.2126, 0.7152, 0.0722)));
  outColor = vec4(c + (n - 0.5) * uGrain * dark, 1.0);
}
`;
