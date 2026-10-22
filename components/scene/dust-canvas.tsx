"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { createSceneHost, type SceneHost } from "@/lib/scene/host";
import type { MarkMask, MarkState, SceneFrame, SceneStats, SceneStatus } from "@/lib/scene/protocol";
import { sceneTuning } from "@/lib/scene-tuning";

export type DustSceneHandle = {
  /** Raw ride progress 0..1 (the scene follows it smoothly; `snap` jumps there). */
  setProgress(p: number, snap?: boolean): void;
  /** The wordmark drawn under the dust: its shape once, then where it is and how much shows. */
  setMarkMask(mask: MarkMask): void;
  setMark(mark: MarkState): void;
};

/**
 * Full-viewport dust scene behind the page. The canvas fades in once the first frame
 * with the car is drawn; without WebGL2 the `poster` stays in its place.
 */
export function DustCanvas({
  ref,
  poster,
  stats = false,
  warmup = 0,
  onStats,
  onFrame,
  onStatus,
}: {
  ref?: Ref<DustSceneHandle>;
  poster?: ReactNode;
  stats?: boolean;
  /** How long the page's start-lights intro covers the scene (ms), if it plays this time. */
  warmup?: number;
  onStats?: (stats: SceneStats) => void;
  /** Camera speed and the floating store products, once a frame. */
  onFrame?: (frame: SceneFrame) => void;
  onStatus?: (status: SceneStatus) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<SceneHost | null>(null);
  const progress = useRef(0);
  const mark = useRef<{ mask: MarkMask | null; state: MarkState | null }>({ mask: null, state: null });
  const [status, setStatus] = useState<SceneStatus>("loading");
  const reportStats = useEffectEvent((stats: SceneStats) => onStats?.(stats));
  const reportFrame = useEffectEvent((frame: SceneFrame) => onFrame?.(frame));
  const reportStatus = useEffectEvent((s: SceneStatus) => onStatus?.(s));

  useImperativeHandle(
    ref,
    () => ({
      setProgress(p, snap) {
        progress.current = p;
        host.current?.setProgress(p, snap);
      },
      setMarkMask(mask) {
        mark.current.mask = mask;
        host.current?.setMarkMask(mask);
      },
      setMark(state) {
        mark.current.state = state;
        host.current?.setMark(state);
      },
    }),
    [],
  );

  useEffect(() => {
    const container = box.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(pointer: coarse), (max-width: 767px)").matches;

    const scene = createSceneHost(container, {
      mobile,
      reducedMotion: motion.matches,
      stats,
      // The intro is skipped on a return within the session (set before paint).
      warmup: document.documentElement.dataset.intro === "skip" ? 0 : warmup,
      onStatus: (s) => {
        setStatus(s);
        reportStatus(s);
      },
      onStats: (s) => reportStats(s),
      onFrame: (f) => reportFrame(f),
    });
    scene.setProgress(progress.current);
    if (mark.current.mask) scene.setMarkMask(mark.current.mask);
    if (mark.current.state) scene.setMark(mark.current.state);
    host.current = scene;

    const resize = new ResizeObserver(() => scene.resize());
    resize.observe(container);
    const onMotion = () => scene.setReducedMotion(motion.matches);
    motion.addEventListener("change", onMotion);
    const onVisibility = () => scene.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);

    // Mouse and pen throw up the dust on hover; a finger only while it drags. Every event goes
    // straight to the engine with its velocity; the engine extrapolates to its own frame.
    let dragging = false;
    let last: { x: number; y: number; t: number } | null = null;
    const toScene = (e: PointerEvent, active: boolean) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = 1 - (e.clientY / window.innerHeight) * 2;
      const dt = last ? Math.max(4, e.timeStamp - last.t) / 1000 : 0;
      const vx = last && active ? (x - last.x) / dt : 0;
      const vy = last && active ? (y - last.y) / dt : 0;
      last = active ? { x, y, t: e.timeStamp } : null;
      scene.setPointer({ x, y, vx, vy, at: performance.timeOrigin + e.timeStamp, active });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        if (dragging) toScene(e, true);
      } else toScene(e, true);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      dragging = true;
      toScene(e, true);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      dragging = false;
      toScene(e, false);
    };
    const onLeave = () => {
      last = null;
      scene.setPointer({ x: 0, y: 0, vx: 0, vy: 0, at: performance.timeOrigin + performance.now(), active: false });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      resize.disconnect();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      scene.destroy();
      host.current = null;
    };
  }, [stats, warmup]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div
        ref={box}
        className="absolute inset-0 transition-opacity ease-out"
        style={{ opacity: status === "ready" ? 1 : 0, transitionDuration: `${sceneTuning.render.fadeIn}ms` }}
      />
      {status === "unsupported" || status === "error" ? poster : null}
    </div>
  );
}
