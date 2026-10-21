/**
 * Every number that shapes the dust scene lives here.
 * Units: world units ≈ metres, angles in degrees, colours as sRGB hex.
 * Sizes marked `px` are CSS pixels (scaled by the device pixel ratio in the engine).
 * Scroll lengths are in screens (multiples of the viewport height).
 */

export const sceneTuning = {
  render: {
    /** Device pixel ratio caps. */
    dpr: { desktop: 2, mobile: 1.5 },
    /** Multiplies the HDR buffer before tone mapping. */
    exposure: 0.9,
    /** Film grain after tone mapping, as a share of full white (also hides banding). */
    grain: 0.03,
    /** Darkening towards the corners, 0 = none. */
    vignette: 0.4,
    bloom: {
      /** HDR value where bloom starts. */
      threshold: 1,
      /** Soft knee width around the threshold. */
      knee: 0.3,
      /** Overall bloom gain. */
      strength: 1.05,
      /** Upsample filter spread in texels. */
      radius: 1.15,
      /** Mip levels (half resolution and down). */
      levels: 5,
    },
    /** Canvas fades in this long after the first frame (ms). */
    fadeIn: 900,
    /**
     * Adaptive density: after a warm-up, frame rate is measured in short windows and the
     * dense layers are thinned until it holds the target; then the density is locked.
     */
    adaptive: { target: 60, warmup: 300, window: 450, windows: 4, min: 0.2 },
  },

  /**
   * Glow behind the horizon in the chapter colour, centred on the track far ahead:
   * HDR intensity, height above the horizon and depth below it (sine of the angle),
   * azimuth spread, and how far ahead along the track it sits.
   */
  horizon: {
    intensity: 0.42,
    height: 0.085,
    below: 0.012,
    spread: 0.32,
    distance: 180,
    /** Cool haze hugging the horizon over the terrain: colour, intensity, thickness, offset. */
    haze: "#24506b",
    hazeIntensity: 0.06,
    hazeHeight: 0.04,
    hazeOffset: 0.01,
  },

  camera: {
    /** Vertical field of view. */
    fov: 48,
    /** Portrait screens widen the vertical FOV so the horizontal one never drops below this. */
    minHorizontalFov: 64,
    near: 0.2,
    far: 700,
    /** Height above the track surface. */
    height: 2.1,
    /** Sideways offset from the centre line (+ = right). */
    lateral: -0.9,
    /** How far ahead along the track the camera looks. */
    lookAhead: 16,
    /** Height of the look-at point above the track. */
    targetHeight: 0.35,
    /** Bank into corners: degrees per (curvature × speed). Flip the sign to bank the other way. */
    rollGain: 2.4,
    maxRoll: 7,
    /** Smoothing rate for roll and speed (1/s). */
    damping: 4,
    /** FOV widening with speed: degrees per world unit per second, and its cap. */
    fovKick: 0.045,
    maxFovKick: 9,
    /** Speed (world units per second) treated as "flat out" for streaks and FOV. */
    topSpeed: 160,
  },

  /** Depth of field: circle of confusion = viewport height × aperture × |depth − focus| / depth. */
  dof: {
    nearAperture: 0.011,
    farAperture: 0.0004,
    /** Only this share of particles turns into bokeh, and only closer than `bokehRange`. */
    bokehShare: 0.025,
    bokehRange: 2,
    /** Focus between stops: on the road this far ahead. At stops it moves onto the vehicle. */
    roadFocus: 15,
  },

  /** Splat limits shared by every layer. */
  splat: {
    /** Particles smaller than this are drawn at this size and dimmed instead (px). */
    minPx: 0.75,
    /** Largest bokeh disc radius (px); sharp particles are capped per layer by `sharpPx`. */
    maxPx: 60,
    /** How fast sub-pixel particles dim: 1 = linear with radius, 2 = by area. */
    subPixelFalloff: 1.15,
    /** Particles closer than near + fade range fade in from nothing. */
    nearFade: 1.4,
    /** Distance haze: starts at `farStart`, exponential density after it. */
    farStart: 110,
    farDensity: 0.003,
  },

  /** Motion streaks: splats stretch along their on-screen motion since the last frame. */
  streak: {
    /** Streak length per pixel of motion. */
    gain: 1.15,
    /** Longest streak (px). */
    maxPx: 160,
    /** 1 = streak trails fully behind the particle, 0.5 = centred on it. */
    trail: 0.85,
  },

  /** Per-particle colour around the chapter colour. */
  colour: {
    /** Hue spread either side (degrees). */
    hueJitter: 25,
    /** Brightness spread (multiplier range). */
    value: [0.55, 1.35],
    /** How much brighter the near-white sparks are (their share is set per layer). */
    sparkBoost: 2.6,
    /** Warm white used for sparks, smoke and stars. */
    white: "#fff3e2",
    /** Page background, blended under the tone-mapped image. */
    background: "#0b0d14",
  },

  /**
   * Layer looks: colour ("chapter" follows the ride, "ground" follows each stop's ground colour), radius (world units), intensity (HDR),
   * pull towards warm white, share of near-white sparks, twinkle amount and speed, and the
   * largest radius a sharp (non-bokeh) particle may reach on screen (px). Brightness comes
   * from overlap: each grain is faint and small.
   */
  layers: {
    road: { colour: "chapter", size: 0.02, intensity: 0.27, whiteMix: 0.04, spark: 0.03, twinkle: 0.18, twinkleSpeed: 2.2, sharpPx: 1.6 },
    edge: { colour: "chapter", size: 0.024, intensity: 0.3, whiteMix: 0.72, spark: 0.06, twinkle: 0.3, twinkleSpeed: 3.1, sharpPx: 1.8 },
    terrain: { colour: "ground", size: 0.03, intensity: 0.24, whiteMix: 0, spark: 0.01, twinkle: 0.3, twinkleSpeed: 1.2, sharpPx: 1.5 },
    fog: { colour: "#2b5d7a", size: 3.4, intensity: 0.007, whiteMix: 0, spark: 0, twinkle: 0, twinkleSpeed: 0, sharpPx: 400 },
    stars: { colour: "#c4d8ff", size: 0.5, intensity: 0.6, whiteMix: 0.4, spark: 0.08, twinkle: 0.45, twinkleSpeed: 1.3, sharpPx: 2 },
    car: { colour: "chapter", size: 0.011, intensity: 0.07, whiteMix: 0.08, spark: 0.03, twinkle: 0.22, twinkleSpeed: 4.5, sharpPx: 1.6 },
    smoke: { colour: "chapter", size: 0.02, intensity: 0.25, whiteMix: 0.62, spark: 0.01, twinkle: 0.1, twinkleSpeed: 1.1, sharpPx: 1.8 },
  },

  /**
   * Particle counts per device class: desktop ≈ 1.1M, phone ≈ 250k drawn points.
   * `car` counts model points (all 120k plus extra points on edges and creases); each is
   * drawn `car.copies` times, so the car alone is `car × copies` points.
   */
  counts: {
    desktop: { road: 260000, edge: 70000, terrain: 200000, fog: 2400, stars: 6000, car: 150000, smoke: 100000 },
    mobile: { road: 70000, edge: 18000, terrain: 45000, fog: 900, stars: 2000, car: 27000, smoke: 15000 },
  },

  /** The car's own buffer is soft-capped at this HDR value before it joins the scene. */
  carCeiling: 1.4,

  track: {
    /** Half the road width. */
    halfWidth: 4.5,
    /** Edge bands as a share of the road width, height jitter, and how ragged their borders are. */
    edgeBand: 0.06,
    edgeLift: 0.05,
    /** Border noise: amplitude (m) and wavelengths of its two octaves (m). */
    edgeRagged: [0.16, 3.5, 0.7],
    /** Surface jitter above the road. */
    surfaceLift: 0.03,
    /**
     * Road surface profile: this share of the road dust gathers towards both edges, thinning
     * inwards over the given distance (m), so the middle reads dimmer than the sides.
     */
    roadEdges: [0.4, 1.6],
    /** Road drawn before the start line and past the end. */
    lead: 12,
    tail: 20,
    /** Height fog over the road and terrain: lateral spread, base height and thickness. */
    fogSpread: 26,
    fogBase: 0.2,
    fogHeight: 2.6,
    /** Fog churn: amplitude, field scale, speed. */
    fogDrift: [1.4, 0.06, 0.08],
    /** Terrain: gap after the edge, share kept near the track, near spread (m), far reach (m). */
    terrainGap: 1.2,
    terrainNear: 0.82,
    terrainSpread: 16,
    terrainReach: 650,
    /**
     * Hills either side: banks rise from `bankFrom` to `bankTo` metres off the edge up to
     * `bank` metres, with rolling hills of `height` and `wave` length on top.
     */
    hills: { bank: 5, bankFrom: 3, bankTo: 55, height: 3.2, wave: 80 },
    /** Slow ripple of the terrain dust: amplitude, field scale, speed. */
    terrainDrift: [0.18, 0.05, 0.05],
    /** Stars sit on a dome around the camera. */
    starRadius: 320,
    /** Lowest star elevation (sin of the angle); slightly below the horizon hides the seam. */
    starHorizon: -0.06,
    /** Control-point spacing used to turn the segments below into a Catmull-Rom spline. */
    straightStep: 12,
    turnStep: 6,
    /**
     * The circuit, walked from the start line heading into the screen.
     * `turn` is degrees (+ = right), `rise` is metres gained over the segment.
     * A `stop` sits at the middle of its segment (the apex on corners).
     */
    segments: [
      { straight: 48 },
      { turn: -80, radius: 24, stop: "drift" },
      { straight: 40, rise: 1.5 },
      { turn: 95, radius: 30, stop: "formula" },
      { straight: 46, rise: 2.5 },
      { turn: -85, radius: 22, stop: "moto" },
      { straight: 42, rise: -1 },
      { turn: 65, radius: 38, stop: "store" },
      { straight: 56, rise: 1 },
      { turn: -25, radius: 70 },
      { straight: 60, stop: "live" },
    ],
  },

  /**
   * Chapter stops: colour, the complementary terrain colour (`ground`) that sets the vehicle off,
   * and how the camera frames each one.
   */
  stops: {
    /**
     * `back`: camera distance before the apex at mid-stop (negative = past it); `dwell`: distance
     * it covers during the stop. Drift chases the car instead: level with it (`ahead`), on the
     * inside of the corner (`inside`), low (`height`), aiming slightly above its centre (`aim`).
     */
    drift: {
      colour: "#e3a04f",
      ground: "#3f8ea6",
      view: { back: -6, dwell: 24, side: 0, height: 1.1, look: 1 },
      chase: { ahead: 1.2, inside: 6.4, height: 1.9, aim: -0.1 },
    },
    formula: { colour: "#d9573f", ground: "#3f8ea6", view: { back: 14, dwell: 5, side: 2, height: 1.6, look: 0.6 } },
    moto: { colour: "#8fb3d6", ground: "#8a6a3a", view: { back: 13, dwell: 5, side: 2.4, height: 2.2, look: 0.6 } },
    store: { colour: "#f2e9dc", ground: "#3f8ea6", view: { back: 16, dwell: 5, side: 0, height: 3.2, look: 0.4 } },
    live: { colour: "#e3a04f", ground: "#3f8ea6", view: { back: 18, dwell: 5, side: 0, height: 2.6, look: 0.3 } },
  },

  /** How scrolling maps onto the ride. */
  scroll: {
    /** Opening view before the ride starts moving. */
    hero: 0.6,
    /** Distance the camera creeps during the opening view. */
    heroDistance: 1.5,
    /** Ride between stops. */
    travel: 1.8,
    /** Time spent at each stop (the distance covered is set per stop). */
    dwell: 1.6,
    /** After the last stop. */
    tail: 0.4,
    tailDistance: 3,
    /** Camera blends into a stop framing over this distance either side of the dwell. */
    stopBlend: 22,
  },

  /** The drift car and its slide through the first corner. */
  car: {
    model: "/models/drift-car.f32",
    /** Model is 2 units long (−1..1); this makes it ≈ 4.4 m. */
    scale: 2.2,
    /**
     * Parked in the opening view: distance ahead of the start, lateral offset (+ = right)
     * and nose angle off the track direction (+ = towards the left, showing the right flank).
     */
    heroDistance: 11,
    heroLateral: 3.1,
    heroYaw: 26,
    /** Where the slide starts and ends relative to the apex. */
    entry: 6,
    exit: 18,
    /** Out-in-out line: lateral swing either side of the centre line. */
    lane: 2.3,
    /** Peak slip angle, and the opposite flick before it. */
    maxSlip: 52,
    flick: 11,
    /** Body roll towards the outside at full slip, and nose lift on launch. */
    roll: 3.5,
    squat: 2.5,
    /** After the slide the car pulls away this many times faster than the camera… */
    runAway: 1.8,
    /** …and dissolves between these distances ahead of the camera. */
    dissolve: [42, 80],
    /** Rear axle position along the body (model units) and wheel contact height. */
    rearAxle: -0.62,
    wheelLift: 0.1,
    /** Assembly from dust when the scene starts (s) and how scattered the dust is. */
    intro: 2.4,
    formSpread: 2.2,
    formLift: 1.1,
    formSwirl: 0.55,
    /** Share of the assembly spent waiting on per-particle delays. */
    formDelay: 0.55,
    /** Constant fine shimmer of the body particles (model units). */
    shimmer: 0.004,
    /**
     * Densifying: each model point is drawn `copies` times, jittered across the local surface
     * by `copySpread` × the point spacing (and a fifth of that along the normal).
     */
    copies: 4,
    copySpread: 0.9,
    /** How much tighter the jitter is on edges and creases (1 = none there). */
    edgeTighten: 0.7,
    /** Neighbours used to estimate each point's normal and how sharply the surface bends there. */
    neighbours: 10,
    /** Share of the car's points spent again on the most bent places (edges, creases, rims)… */
    edgeExtra: 0.2,
    /** …which also glow this much brighter. */
    edgeBoost: 1.6,
  },

  /** Tyre smoke from the rear wheels during the slide. */
  smoke: {
    /** Slide progress range that emits smoke. */
    emit: [0.05, 0.93],
    /** Slide progress it takes a puff to fully grow, and to fade away after birth. */
    grow: 0.2,
    life: 0.42,
    /** Puff radius when born and when grown. */
    spread: [0.25, 1.9],
    /** Rise of a grown puff. */
    rise: 0.7,
    /** Smoke tops out softly at this many car heights above the road. */
    ceiling: 1.5,
    /** Kick backwards along the body. */
    kick: 1.6,
    /** Swirl: amplitude, field scale, speed. */
    swirl: [0.7, 0.6, 0.22],
    /** Particle size multiplier when born and when grown. */
    size: [0.6, 2],
    /** Puffs fade out between these distances from the camera so they never fill the frame. */
    cameraFade: [2, 5],
    /** Samples of the slide path used as emitters. */
    samples: 64,
  },
} as const;

export type SceneTuning = typeof sceneTuning;
export type StopId = keyof SceneTuning["stops"];
