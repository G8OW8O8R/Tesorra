import { sceneTuning } from "@/lib/scene-tuning";
import type { DustEngine } from "./engine";
import type {
  EngineEvent,
  EngineOptions,
  HostMessage,
  MarkMask,
  MarkState,
  PointerState,
  SceneStats,
  SceneFrame,
  SceneStatus,
} from "./protocol";

export type SceneHost = {
  setProgress(p: number, snap?: boolean): void;
  setReducedMotion(value: boolean): void;
  setVisible(value: boolean): void;
  /** Raw cursor, sent on straight away. */
  setPointer(pointer: PointerState): void;
  /** The wordmark drawn under the dust: its shape once, then where it is. */
  setMarkMask(mask: MarkMask): void;
  setMark(mark: MarkState): void;
  /** Re-reads the container size. */
  resize(): void;
  destroy(): void;
};

type HostOptions = {
  mobile: boolean;
  reducedMotion: boolean;
  stats?: boolean;
  /** How long an intro still covers the scene (ms). */
  warmup?: number;
  onStatus(status: SceneStatus): void;
  onStats?(stats: SceneStats): void;
  onFrame?(frame: SceneFrame): void;
};

/**
 * Mounts a canvas into `container` and drives the dust engine from a worker on an
 * OffscreenCanvas. If that is not available, or the worker fails before its first frame,
 * the engine runs on the main thread on a fresh canvas instead.
 */
export function createSceneHost(container: HTMLElement, options: HostOptions): SceneHost {
  let progress = 0;
  let reduced = options.reducedMotion;
  let visible = true;
  let mask: MarkMask | null = null;
  let mark: MarkState | null = null;
  let destroyed = false;
  let canvas: HTMLCanvasElement | null = null;
  let send: (message: HostMessage) => void = () => {};
  let teardown = () => {};

  const size = () => {
    const cap = options.mobile ? sceneTuning.render.dpr.mobile : sceneTuning.render.dpr.desktop;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    return {
      width: Math.round(container.clientWidth * dpr),
      height: Math.round(container.clientHeight * dpr),
      dpr,
    };
  };

  const engineOptions = (): EngineOptions => ({
    ...size(),
    mobile: options.mobile,
    reducedMotion: reduced,
    baseUrl: window.location.href,
    stats: Boolean(options.stats),
    warmup: options.warmup ?? 0,
  });

  const onEvent = (event: EngineEvent) => {
    if (destroyed) return;
    if (event.type === "stats") options.onStats?.(event.stats);
    else if (event.type === "frame") options.onFrame?.(event.data);
    else options.onStatus(event.status);
  };

  const mountCanvas = () => {
    canvas?.remove();
    canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);
    return canvas;
  };

  const restore = () => {
    send({ type: "progress", value: progress, snap: true });
    send({ type: "visible", value: visible });
    if (mask) send({ type: "markMask", mask });
    if (mark) send({ type: "mark", mark });
  };

  function runOnMainThread() {
    const surface = mountCanvas();
    let engine: DustEngine | null = null;
    send = (message) => {
      if (!engine) return;
      if (message.type === "progress") engine.setProgress(message.value, message.snap);
      else if (message.type === "resize") engine.resize(message.width, message.height, message.dpr);
      else if (message.type === "reducedMotion") engine.setReducedMotion(message.value);
      else if (message.type === "visible") engine.setVisible(message.value);
      else if (message.type === "pointer") engine.setPointer(message.pointer);
      else if (message.type === "markMask") engine.setMarkMask(message.mask);
      else if (message.type === "mark") engine.setMark(message.mark);
    };
    teardown = () => engine?.dispose();
    import("./engine")
      .then(({ DustEngine }) => {
        if (destroyed) return;
        engine = DustEngine.create(surface, engineOptions(), onEvent);
        restore();
      })
      .catch(() => onEvent({ type: "status", status: "error" }));
  }

  function runInWorker() {
    const surface = mountCanvas();
    const worker = new Worker(new URL("./scene.worker.ts", import.meta.url), { type: "module" });
    const offscreen = surface.transferControlToOffscreen();
    let started = false;

    const fallBack = () => {
      worker.terminate();
      if (!destroyed) runOnMainThread();
    };
    worker.onmessage = ({ data }: MessageEvent<EngineEvent>) => {
      if (data.type === "status" && data.status === "error" && !started) return fallBack();
      if (data.type === "status" && data.status === "ready") started = true;
      onEvent(data);
    };
    worker.onerror = () => {
      if (!started) fallBack();
    };

    send = (message) => worker.postMessage(message);
    teardown = () => {
      worker.postMessage({ type: "dispose" } satisfies HostMessage);
      worker.terminate();
    };
    worker.postMessage({ type: "init", canvas: offscreen, options: engineOptions() } satisfies HostMessage, [
      offscreen,
    ]);
    restore();
  }

  const canUseWorker =
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype;
  try {
    if (canUseWorker) runInWorker();
    else runOnMainThread();
  } catch {
    runOnMainThread();
  }

  return {
    setProgress(p, snap) {
      progress = p;
      send({ type: "progress", value: p, snap });
    },
    setReducedMotion(value) {
      reduced = value;
      send({ type: "reducedMotion", value });
    },
    setPointer(pointer) {
      send({ type: "pointer", pointer });
    },
    setMarkMask(value) {
      mask = value;
      send({ type: "markMask", mask: value });
    },
    setMark(value) {
      mark = value;
      send({ type: "mark", mark: value });
    },
    setVisible(value) {
      visible = value;
      send({ type: "visible", value });
    },
    resize() {
      send({ type: "resize", ...size() });
    },
    destroy() {
      destroyed = true;
      teardown();
      canvas?.remove();
      canvas = null;
    },
  };
}
