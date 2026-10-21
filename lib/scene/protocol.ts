/** Messages between the page and the scene engine (in a worker or on the main thread). */

export type EngineOptions = {
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  reducedMotion: boolean;
  /** Absolute URL of the drift car point cloud. */
  modelUrl: string;
  /** Report frames per second (development pages). */
  stats: boolean;
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

export type EngineEvent =
  | { type: "status"; status: Exclude<SceneStatus, "loading">; message?: string }
  | { type: "stats"; stats: SceneStats };

export type HostMessage =
  | { type: "init"; canvas: OffscreenCanvas; options: EngineOptions }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "progress"; value: number }
  | { type: "reducedMotion"; value: boolean }
  | { type: "visible"; value: boolean }
  | { type: "pointer"; pointer: PointerState }
  | { type: "dispose" };
