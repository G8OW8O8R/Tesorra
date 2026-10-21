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

/** Frames per second, points drawn per frame, and the adaptive density (share of the dense layers). */
export type SceneStats = { fps: number; points: number; density: number };

export type SceneStatus = "loading" | "ready" | "unsupported" | "error";

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
  | { type: "progress"; value: number }
  | { type: "reducedMotion"; value: boolean }
  | { type: "visible"; value: boolean }
  | { type: "pointer"; pointer: PointerState }
  | { type: "dispose" };
