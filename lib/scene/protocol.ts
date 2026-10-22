/** Messages between the page and the scene engine (in a worker or on the main thread). */

export type EngineOptions = {
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  reducedMotion: boolean;
  /** Page URL the point cloud paths are resolved against. */
  baseUrl: string;
  /** Report frames per second (development pages). */
  stats: boolean;
  /** How long the page's intro still covers the scene (ms): loading may hold the thread longer meanwhile. */
  warmup: number;
};

/**
 * Raw cursor in normalised device coordinates with its velocity (NDC per second) and the absolute
 * time of the event (timeOrigin + timeStamp, ms), so the engine can extrapolate to its own frame.
 * `active` is false when it left the window or the finger lifted.
 */
export type PointerState = { x: number; y: number; vx: number; vy: number; at: number; active: boolean };

/**
 * Frames per second, points drawn per frame, the adaptive density (share of the dense layers), the
 * engine's own time per frame on its thread (ms) and the GPU time per frame (ms, null without timer
 * queries).
 */
export type SceneStats = { fps: number; points: number; density: number; cpu: number; gpu: number | null };

export type SceneStatus = "loading" | "ready" | "unsupported" | "error";

/**
 * The TESORRA wordmark's shape for the scene: one byte of coverage a texel (rows from the top),
 * the boundaries between its letters as shares of its width along the slant of the letters, and
 * that slant (x shift per unit of height, as a share of the width).
 */
export type MarkMask = { width: number; height: number; data: Uint8Array; cuts: number[]; slope: number };

/**
 * Where the page has the wordmark (shares of the viewport: left, top, right, bottom), how much of
 * it the scene draws (0..1) and how much of its fade into the horizon shows (0..1).
 */
export type MarkState = { rect: [number, number, number, number]; opacity: number; fog: number };

/**
 * Sent once a frame as one transferable array: camera speed (m/s, damped as the engine uses it),
 * then while the store stop is near the floating products, four numbers each:
 * [speed, count, x, y, size, form, …] (NDC position, size relative to `store.refDepth`, 0..1 form).
 */
export type SceneFrame = Float32Array;

export type EngineEvent =
  | { type: "status"; status: Exclude<SceneStatus, "loading">; message?: string }
  | { type: "stats"; stats: SceneStats }
  | { type: "frame"; data: SceneFrame };

export type HostMessage =
  | { type: "init"; canvas: OffscreenCanvas; options: EngineOptions }
  | { type: "resize"; width: number; height: number; dpr: number }
  /** Raw ride progress (the scroll target); the engine damps the camera towards it, or jumps with `snap`. */
  | { type: "progress"; value: number; snap?: boolean }
  | { type: "reducedMotion"; value: boolean }
  | { type: "visible"; value: boolean }
  | { type: "pointer"; pointer: PointerState }
  | { type: "markMask"; mask: MarkMask }
  | { type: "mark"; mark: MarkState }
  | { type: "dispose" };
