/**
 * Every number that shapes the dust scene lives here.
 * Units: world units ≈ metres, angles in degrees, colours as sRGB hex.
 * Sizes marked `px` are CSS pixels (scaled by the device pixel ratio in the engine).
 * Scroll lengths are in screens (multiples of the viewport height).
 */

/** Densifying and assembly shared by the dust bodies after the drift car (same values as the car). */
const dustBody = {
  copies: 4,
  copySpread: 0.9,
  edgeTighten: 0.7,
  neighbours: 10,
  edgeExtra: 0.2,
  edgeBoost: 1.6,
  shimmer: 0.004,
  formSwirl: 0.55,
  formDelay: 0.55,
} as const;

export const sceneTuning = {
  render: {
    /** Device pixel ratio caps. */
    dpr: { desktop: 2, mobile: 1 },
    /** Multiplies the HDR buffer before tone mapping. */
    exposure: 0.9,
    /** Film grain after tone mapping, as a share of full white, in the dark tones only (hides banding). */
    grain: 0.008,
    /** Darkening towards the corners, 0 = none. */
    vignette: 0.25,
    /**
     * Afterglow: share of last frame's dust kept (max blend) at a stop, and at top camera speed.
     * The bodies are not part of it.
     */
    trail: { still: 0.2, fast: 0.5 },
    bloom: {
      /** HDR value where bloom starts. */
      threshold: 1,
      /** Soft knee width around the threshold. */
      knee: 0.3,
      /** Overall bloom gain. */
      strength: 1.05,
      /** Upsample filter spread in texels. */
      radius: 1.15,
      /** Mip levels from half resolution down, per device class. */
      levels: { desktop: 5, mobile: 3 },
    },
    /** Canvas fades in this long after the first frame (ms). */
    fadeIn: 900,
    /**
     * Adaptive density (desktop): the dense layers and the bodies start thinned so a busy stop
     * draws about `budget` points. After a warm-up, frame rate is measured in short windows:
     * `steady` windows in a row at the target raise the density by `raise` (up to `ceiling` points
     * at a busy stop), a window short of it lowers it and stops the climb. Phones draw their own
     * smaller counts.
     */
    adaptive: {
      target: 60,
      budget: 700000,
      ceiling: 700000,
      warmup: 300,
      window: 450,
      windows: 14,
      steady: 2,
      raise: 1.12,
      min: 0.2,
    },
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
    /**
     * Portrait screens at a stop: the camera backs away from what it frames by this factor so the
     * whole vehicle fits, and the picture shifts up by this share of the half-height (NDC), clear
     * of the panel along the bottom.
     */
    portraitPull: 1.55,
    portraitShift: 0.34,
  },

  /**
   * The opening view: lower than the ride and closer to level, so the horizon sits under the
   * wordmark and the car's roof and smoke reach up into its letters. Eye height, lateral offset
   * (portrait screens move it right so the car stands under the wordmark), look-at height, and the
   * camera metres past the opening view over which it eases into the ride's own camera.
   * `portraitShift` lifts the picture on portrait screens (NDC share of the half-height).
   */
  hero: {
    height: 1.2,
    lateral: -0.9,
    portraitLateral: 0.5,
    targetHeight: 0,
    blend: 14,
    portraitShift: 0.28,
  },

  /**
   * The TESORRA wordmark drawn into the scene at the opening view, under the dust, so the car and
   * its smoke cover it. `sink`: share of its height below the horizon; `fog`: lower share of the
   * letters that fades into the horizon haze. `cover`: how the dust hides it — gain of the car's
   * own buffer, gain of the rest of the scene and the HDR level the scene starts covering at (the
   * horizon glow stays under it). `handoff`: share of the fly into the bar after which the page's
   * own SVG takes over (the bar sits over the canvas).
   * Assembly from dust after the intro: seconds per letter, delay between letters, grain size
   * (px), how far grains start (share of the wordmark width) and how much hotter they burn while
   * flying in.
   */
  mark: {
    sink: 0.06,
    fog: 0.25,
    cover: [3, 1.6, 0.45],
    handoff: 0.3,
    assemble: { letter: 0.8, stagger: 0.09, grainPx: 2, scatter: 0.06, heat: 1.4 },
    /** The car must be in this soon after the intro ends (ms) for the letters to assemble at all. */
    grace: 150,
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
    /**
     * A sharp grain: a flat core with a one-pixel antialiased rim, `core` of its radius across (at
     * least `coreMinPx`), carrying `coreShare` of its energy; a soft halo out to the quad's edge
     * carries the rest.
     */
    core: 0.5,
    coreMinPx: 0.6,
    coreShare: 0.8,
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
    gain: 0.6,
    /** Longest streak (px). */
    maxPx: 80,
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
    road: { colour: "chapter", size: 0.02, intensity: 0.45, whiteMix: 0.04, spark: 0.03, twinkle: 0.18, twinkleSpeed: 2.2, sharpPx: 1.6 },
    edge: { colour: "chapter", size: 0.024, intensity: 0.21, whiteMix: 0.72, spark: 0.06, twinkle: 0.3, twinkleSpeed: 3.1, sharpPx: 1.8 },
    terrain: { colour: "ground", size: 0.03, intensity: 0.8, whiteMix: 0, spark: 0.01, twinkle: 0.3, twinkleSpeed: 1.2, sharpPx: 1.5 },
    fog: { colour: "#2b5d7a", size: 3.4, intensity: 0.007, whiteMix: 0, spark: 0, twinkle: 0, twinkleSpeed: 0, sharpPx: 400 },
    stars: { colour: "#c4d8ff", size: 0.5, intensity: 0.6, whiteMix: 0.4, spark: 0.08, twinkle: 0.45, twinkleSpeed: 1.3, sharpPx: 2 },
    car: { colour: "chapter", size: 0.011, intensity: 0.084, whiteMix: 0, spark: 0.03, twinkle: 0.22, twinkleSpeed: 4.5, sharpPx: 1.6 },
    smoke: { colour: "chapter", size: 0.02, intensity: 0.25, whiteMix: 0.62, spark: 0.01, twinkle: 0.1, twinkleSpeed: 1.1, sharpPx: 1.8 },
    wake: { colour: "chapter", size: 0.016, intensity: 0.22, whiteMix: 0.55, spark: 0.04, twinkle: 0.12, twinkleSpeed: 2.4, sharpPx: 1.6 },
    sparks: { colour: "#ffc27a", size: 0.018, intensity: 1.3, whiteMix: 0.5, spark: 0.3, twinkle: 0.5, twinkleSpeed: 9, sharpPx: 2 },
    grid: { colour: "chapter", size: 0.024, intensity: 0.3, whiteMix: 0.72, spark: 0.06, twinkle: 0.3, twinkleSpeed: 3.1, sharpPx: 1.8 },
    lamp: { colour: "#ff4f1f", size: 0.02, intensity: 0.2, whiteMix: 0.08, spark: 0.06, twinkle: 0.08, twinkleSpeed: 7, sharpPx: 2.2 },
  },

  /**
   * Particle counts per device class: desktop ≈ 1.1M at most (thinned to the adaptive budget, about
   * 700k at a busy stop), phone ≤ 120k drawn points at any stop. Road and terrain are sparse and
   * brighter per grain; the edges and the bodies get the points.
   * `car` counts model points (all 120k plus extra points on edges and creases); each is
   * drawn `car.copies` times, so the car alone is `car × copies` points.
   */
  counts: {
    desktop: {
      road: 156000,
      edge: 100000,
      terrain: 120000,
      fog: 2400,
      stars: 6000,
      car: 150000,
      smoke: 100000,
      burnout: 80000,
      wake: 40000,
      sparks: 20000,
      grid: 14000,
      lamp: 7000,
    },
    mobile: {
      road: 20400,
      edge: 12800,
      terrain: 13200,
      fog: 600,
      stars: 1500,
      car: 10000,
      smoke: 9000,
      burnout: 8000,
      wake: 4000,
      sparks: 3000,
      grid: 3000,
      lamp: 1000,
    },
  },

  /**
   * The car's own buffer is soft-capped at this HDR value before it joins the scene (hue is kept,
   * so dense panels saturate instead of turning white). It is added after bloom at full resolution
   * to stay crisp, and feeds the bloom separately with its own gain.
   */
  carCeiling: 1.2,
  carBloom: 1.08,

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
   * and how the camera frames each one. The framing holds fully over `hold` (camera m around the
   * stop camera) and blends in and out over `scroll.stopBlend` either side of it. Every vehicle is
   * framed like the drift car: close, low, about 40-45% of the frame wide.
   */
  stops: {
    /**
     * `back`: camera distance before the apex at mid-stop (negative = past it); `look`: how much
     * of the stop's aim the camera takes. Drift chases the car through its slide: level with it
     * (`ahead`), on the inside of the corner (`inside`), low (`height`), aiming just off its
     * centre (`aim`).
     */
    drift: {
      colour: "#e3a04f",
      ground: "#3f8ea6",
      view: { back: -6, look: 1 },
      chase: { ahead: 1, inside: 4.9, height: 1.7, aim: -0.1 },
    },
    /**
     * `shot`: a camera standing by the track. Eye and aim as [m from the stop camera, lateral m
     * towards the inside of the corner, height]; the eye creeps on at `creep` x the camera's travel,
     * and the aim leans `follow` of the way towards the stop's vehicle.
     * Formula: the car flies past just to the left of the lens and pulls up in frame.
     */
    formula: {
      colour: "#d9573f",
      ground: "#3f8ea6",
      view: { back: 8, look: 1 },
      hold: [-14, 14],
      shot: { eye: [0, 5.6, 0.75], aim: [5.8, -2.6, 0.6], follow: 0.5, creep: 0.1 },
    },
    /** Moto: chased like the drift car, from the inside of the corner where the knee goes down. */
    moto: {
      colour: "#8fb3d6",
      ground: "#8a6a3a",
      view: { back: 0, look: 1 },
      hold: [-12, 12],
      chase: { ahead: 1.4, inside: 4.2, height: 0.8, aim: 0.1 },
    },
    store: {
      colour: "#f2e9dc",
      ground: "#3f8ea6",
      view: { back: 7, look: 1 },
      hold: [-5, 5],
      shot: { eye: [0, 0, 1.6], aim: [12, 0, 1.6], follow: 0, creep: 0.15 },
    },
    /** Live: low on the grid, looking up at the gantry 14 m ahead, aimed right of it so it sits left of the round list. */
    live: {
      colour: "#e3a04f",
      ground: "#3f8ea6",
      view: { back: 6, look: 1 },
      hold: [-5, 5],
      shot: { eye: [0, 0, 1.2], aim: [14, 3.5, 3.6], follow: 0, creep: 0.15 },
    },
  },

  /** How scrolling maps onto the ride. */
  scroll: {
    /** Scroll length of one chapter (ride into a stop + the stop), in svh per device. */
    chapter: { desktop: 160, mobile: 120 },
    /** Opening view before the ride starts moving, in chapters, and how far the camera creeps. */
    hero: 0.25,
    heroDistance: 1.5,
    /** Share of a chapter spent at its stop, and the camera speed there vs. its average ride speed. */
    stopShare: 0.35,
    stopSpeed: 0.12,
    /** After the last stop, in chapters. */
    tail: 0.15,
    tailDistance: 3,
    /** Smooth scrolling on desktop; touch always scrolls natively. */
    lenis: { lerp: 0.1, wheelMultiplier: 1.1 },
    /** The camera follows the scroll target with this time constant (s), on the scene's own clock. */
    follow: 0.15,
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
    heroDistance: 5.8,
    heroLateral: 0.1,
    heroYaw: 35,
    /**
     * Entrance after the wordmark has assembled: `delay` (s after the intro) and `time` (s) of a
     * slide in from the right that brakes into the opening pose; it starts this far off the pose:
     * [m along the track, m lateral, degrees of extra slip].
     */
    drive: { delay: 0.75, time: 1.6, from: [-2.5, 9, 32] },
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
    /** Assembly from dust as the entrance starts (s) and how scattered the dust is. */
    intro: 0.7,
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

  /**
   * Cursor (or a dragging finger) throws up the car's and the smoke's grains, simulated on the GPU:
   * each grain springs back to rest with damping. Per layer: radius around the cursor ray (m),
   * sideways throw per m/s of cursor speed, share of the cursor's own motion carried along, and a
   * gentle sideways push while the cursor rests (m/s); then spring stiffness (1/s²), damping
   * (1/s), how long after the last push the layer keeps simulating (s), and the share of grains
   * with no spring at all, which simply drift off. Phones simulate the car only.
   */
  pointer: {
    car: { radius: 0.45, lateral: 0.3, carry: 0.14, rest: 0.05, spring: 18, damping: 5, settle: 1.6, drift: 0 },
    smoke: { radius: 1, lateral: 0.35, carry: 0.28, rest: 0.05, spring: 6, damping: 2.6, settle: 3, drift: 0.3 },
    /** Terrain is only nudged aside, without state: radius (m, Gaussian) and the shove at the centre (m). */
    terrain: { radius: 0.8, shove: 0.3 },
    /** How quickly the terrain nudge fades in and out as the cursor enters and leaves (1/s). */
    terrainFade: 8,
    /** How quickly grains under the cursor take up its push (1/s). */
    coupling: 30,
    /** Curl swirl on moving grains, and their top speed (m/s). */
    swirl: 0.6,
    maxSpeed: 8,
    /** The cursor is extrapolated up to this far ahead (ms); older than `still` counts as resting. */
    extrapolate: 50,
    still: 120,
    /** Simulation steps per second at most (whatever the display rate), and its longest step (s). */
    rate: 60,
    maxStep: 1 / 30,
    /** State texture width (height follows the number of grains). */
    textureWidth: 1024,
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

  /**
   * Smoke from the rear wheels in the opening view, on a clock rather than the scroll: each grain
   * lives `cycle` seconds and is born again at the wheels. It starts with the car's entrance (and
   * trails it in), stops when the ride sets off and the last puffs drift on. `grow` and the fades
   * are shares of a grain's life; `wind` carries it across to the right and away from the lens
   * (shares of the track's side and direction) instead of back along the body, `kick` metres per
   * car scale; the rest reads as for `smoke`.
   */
  burnout: {
    emit: [0, 1],
    cycle: 3.4,
    grow: 0.3,
    life: 1,
    spread: [0.35, 2.1],
    rise: 0.8,
    kick: 1.3,
    wind: [1, 0.35],
    swirl: [0.8, 0.55, 0.22],
    size: [0.7, 2.2],
    cameraFade: [0.8, 2.2],
    samples: 32,
  },

  /**
   * Dust bodies at the later stops, densified and drawn like the drift car (crisp, its own buffer,
   * same cursor physics). `entries` are model points per device (procedural shapes are generated
   * at that size), `scale` turns model units into metres, `glow` scales the car layer's intensity.
   * `formLift` < 0 leaves the scattered dust lying low, so the body rises out of it.
   */
  bodies: {
    formula: {
      ...dustBody,
      model: "/models/formula.f32",
      entries: { desktop: 150000, mobile: 10000 },
      scale: 2.7,
      glow: 1,
      formSpread: 2.4,
      formLift: 0.6,
    },
    /** The bike plus a rider in a racing tuck (procedural, `rider` x the model's points), inside knee out. */
    moto: {
      ...dustBody,
      model: "/models/moto.f32",
      rider: 0.4,
      entries: { desktop: 120000, mobile: 9000 },
      scale: 1.2,
      glow: 1,
      formSpread: 1.8,
      formLift: 0.8,
    },
    gantry: {
      ...dustBody,
      shape: "gantry",
      entries: { desktop: 50000, mobile: 6000 },
      copies: 3,
      scale: 1,
      glow: 0.75,
      formSpread: 1.4,
      formLift: -1.6,
    },
  },

  /**
   * 02 FORMULA: over the stop's hold the car runs from `from` (m from the stop camera, behind the
   * lens) on `lane` (m towards the inside), braking hard (`brake`: share of the hold spent moving,
   * `power`: how late it brakes) to stand at `rest` ([m from the stop camera, lane]) turned `turnIn`
   * degrees into the corner. It assembles out of sight over `assemble` (share of the hold before it);
   * afterwards it pulls away at up to `runAway` x the camera's pace and dissolves over `dissolve`
   * (camera m after the hold).
   */
  formula: {
    from: -14,
    lane: 2.2,
    rest: [5.8, 1.4],
    brake: 0.54,
    power: 2.4,
    turnIn: 10,
    assemble: 0.15,
    runAway: 2.2,
    dissolve: [12, 40],
  },

  /**
   * 03 MOTO: the bike rides beside the camera, then leans through the corner over the stop's hold
   * from `entry` before the apex to `exit` after it, out-in-out by `lane` (m), down to `lean`
   * degrees. Assembles over `assemble` (camera m before the hold); afterwards it pulls away at
   * `runAway` x the camera's pace and dissolves between these distances ahead of the camera.
   */
  moto: {
    entry: 12,
    exit: 12,
    lane: 2.4,
    lean: 45,
    assemble: [-40, -18],
    runAway: 1.8,
    dissolve: [20, 50],
  },

  /** Air wake streaming off the formula car's rear wing tips; fields as for the smoke (ceiling in m). */
  wake: {
    emit: [0.02, 0.46],
    grow: 0.25,
    life: 0.35,
    spread: [0.03, 0.6],
    rise: 0.15,
    ceiling: 3,
    kick: 3.5,
    swirl: [0.35, 0.8, 0.3],
    size: [0.5, 1.2],
    cameraFade: [1.5, 4],
    samples: 64,
    /** Fresh grains streak back along the car's path (m). */
    streak: 2.5,
    /** Emitter point on the body (model units); mirrored across z for the other tip. */
    source: [-0.95, 0.17, 0.33],
  },

  /** Sparks from the knee slider while the bike is down in the corner; fields as for the wake. */
  sparks: {
    emit: [0.28, 0.72],
    grow: 0.35,
    life: 0.1,
    spread: [0.02, 1.4],
    rise: -0.6,
    ceiling: 2,
    kick: 2.2,
    swirl: [0.05, 1, 0.4],
    size: [1, 0.5],
    cameraFade: [1.5, 3],
    samples: 64,
    streak: 0.6,
    /** The rider's inside knee slider (model units, z towards the inside). */
    source: [-0.04, 0.12, 0.6],
  },

  /**
   * 04 STORE: cut-out product photos (HTML) floating over the road in front of the stop camera.
   * Each has a spot on screen (`at`, NDC of a 16:9 view at the stop) and a distance (m); it
   * drifts round it by `drift` (m across, m up, speed), so with the camera and the cursor it
   * moves in parallax. Sizes are set for `refDepth`. Timing in chapters from the stop centre:
   * each comes out of the dust over `appear` and goes back into it over `vanish`, `stagger` apart.
   */
  store: {
    products: [
      { at: [0.0, 0.32], depth: 5 },
      { at: [0.42, 0.02], depth: 4.2 },
      { at: [0.78, 0.4], depth: 6 },
      { at: [-0.4, 0.56], depth: 8 },
      { at: [0.28, 0.62], depth: 9 },
      { at: [0.8, -0.3], depth: 7 },
    ],
    refDepth: 5,
    drift: [0.22, 0.16, 0.35],
    appear: [-0.42, -0.2],
    vanish: [0.22, 0.32],
    stagger: 0.035,
  },

  /**
   * 05 LIVE: the start gantry stands `gantry` m past the stop and assembles over `assemble`
   * (chapters from the stop centre). Once the ride is past `lightsFrom` (chapters from the stop
   * centre) the five lights come on one by one every `lightStep` seconds, like a count, and stay
   * lit; leaving and coming back starts them again. Lamp brightness off / on as
   * multiples of the lamp layer. The grid before the gantry: slot count, spacing (m), first slot
   * behind the gantry (m), lateral offset (m), stroke width (m) and how far behind each stroke
   * the soft pool where its car stands lies (m).
   */
  live: {
    gantry: 8,
    assemble: [-0.95, -0.5],
    lightsFrom: -0.7,
    lightStep: 0.2,
    lampOff: 0.05,
    lampOn: 1,
    grid: { slots: 8, spacing: 8, from: 6, offset: 1.8, width: 2.2, depth: 2.2 },
  },
} as const;

export type SceneTuning = typeof sceneTuning;
export type StopId = keyof SceneTuning["stops"];
export type BodyId = "car" | keyof SceneTuning["bodies"];
