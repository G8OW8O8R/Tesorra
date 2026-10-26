import { sceneTuning } from "@/lib/scene-tuning";
import type { PortraitEngine } from "./portrait";
import type { PortraitEvent, PortraitMessage, PortraitOptions, PortraitPhoto } from "./portrait-protocol";

export type PortraitHost = {
  setColour(rgb: [number, number, number], snap?: boolean): void;
  setPhotos(photos: PortraitPhoto[]): void;
  morph(from: number, to: number): void;
  setPointer(x: number, y: number): void;
  setReducedMotion(value: boolean): void;
  setVisible(value: boolean): void;
  resize(): void;
  destroy(): void;
};

type HostOptions = {
  mobile: boolean;
  reducedMotion: boolean;
  colour: [number, number, number];
  onEvent(event: PortraitEvent): void;
};

/**
 * Mounts a canvas into `container` and runs the driver pages' dust scene in a worker on an
 * OffscreenCanvas, or on the main thread when that is missing or the worker fails before it starts.
 * The last colour and photos are replayed to whichever engine ends up running.
 */
export function createPortraitHost(container: HTMLElement, options: HostOptions): PortraitHost {
  let reduced = options.reducedMotion;
  let visible = true;
  let colour = options.colour;
  let photos: PortraitPhoto[] = [];
  let destroyed = false;
  let canvas: HTMLCanvasElement | null = null;
  let send: (message: PortraitMessage) => void = () => {};
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

  const engineOptions = (): PortraitOptions => ({
    ...size(),
    mobile: options.mobile,
    reducedMotion: reduced,
    baseUrl: window.location.href,
    colour,
  });

  const onEvent = (event: PortraitEvent) => {
    if (!destroyed) options.onEvent(event);
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
    send({ type: "visible", value: visible });
    if (photos.length) send({ type: "photos", photos });
  };

  function runOnMainThread() {
    const surface = mountCanvas();
    let engine: PortraitEngine | null = null;
    send = (message) => {
      if (!engine) return;
      if (message.type === "resize") engine.resize(message.width, message.height, message.dpr);
      else if (message.type === "colour") engine.setColour(message.rgb, message.snap);
      else if (message.type === "photos") engine.setPhotos(message.photos);
      else if (message.type === "morph") engine.morph(message.from, message.to);
      else if (message.type === "pointer") engine.setPointer(message.x, message.y);
      else if (message.type === "reducedMotion") engine.setReducedMotion(message.value);
      else if (message.type === "visible") engine.setVisible(message.value);
    };
    teardown = () => engine?.dispose();
    import("./portrait")
      .then(({ PortraitEngine }) => {
        if (destroyed) return;
        engine = PortraitEngine.create(surface, engineOptions(), onEvent);
        restore();
      })
      .catch(() => onEvent({ type: "status", status: "error" }));
  }

  function runInWorker() {
    const surface = mountCanvas();
    const worker = new Worker(new URL("./portrait.worker.ts", import.meta.url), { type: "module" });
    const offscreen = surface.transferControlToOffscreen();
    let started = false;

    const fallBack = () => {
      worker.terminate();
      if (!destroyed) runOnMainThread();
    };
    worker.onmessage = ({ data }: MessageEvent<PortraitEvent>) => {
      if (data.type === "status" && data.status === "error" && !started) return fallBack();
      if (data.type === "status" && data.status === "ready") started = true;
      onEvent(data);
    };
    worker.onerror = () => {
      if (!started) fallBack();
    };

    send = (message) => worker.postMessage(message);
    teardown = () => {
      worker.postMessage({ type: "dispose" } satisfies PortraitMessage);
      worker.terminate();
    };
    worker.postMessage({ type: "init", canvas: offscreen, options: engineOptions() } satisfies PortraitMessage, [
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
    setColour(rgb, snap) {
      colour = rgb;
      send({ type: "colour", rgb, snap });
    },
    setPhotos(list) {
      photos = list;
      send({ type: "photos", photos: list });
    },
    morph(from, to) {
      send({ type: "morph", from, to });
    },
    setPointer(x, y) {
      send({ type: "pointer", x, y });
    },
    setReducedMotion(value) {
      reduced = value;
      send({ type: "reducedMotion", value });
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
