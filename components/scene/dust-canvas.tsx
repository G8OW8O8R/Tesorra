"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { createSceneHost, type SceneHost } from "@/lib/scene/host";
import type { SceneStats, SceneStatus } from "@/lib/scene/protocol";
import { sceneTuning } from "@/lib/scene-tuning";

export type DustSceneHandle = {
  /** Ride progress 0..1. */
  setProgress(p: number): void;
};

/**
 * Full-viewport dust scene behind the page. The canvas fades in once the first frame
 * with the car is drawn; without WebGL2 the `poster` stays in its place.
 */
export function DustCanvas({
  ref,
  poster,
  stats = false,
  onStats,
}: {
  ref?: Ref<DustSceneHandle>;
  poster?: ReactNode;
  stats?: boolean;
  onStats?: (stats: SceneStats) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<SceneHost | null>(null);
  const progress = useRef(0);
  const [status, setStatus] = useState<SceneStatus>("loading");
  const reportStats = useEffectEvent((stats: SceneStats) => onStats?.(stats));

  useImperativeHandle(
    ref,
    () => ({
      setProgress(p) {
        progress.current = p;
        host.current?.setProgress(p);
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
      onStatus: setStatus,
      onStats: (s) => reportStats(s),
    });
    scene.setProgress(progress.current);
    host.current = scene;

    const resize = new ResizeObserver(() => scene.resize());
    resize.observe(container);
    const onMotion = () => scene.setReducedMotion(motion.matches);
    motion.addEventListener("change", onMotion);
    const onVisibility = () => scene.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);

    // Mouse and pen part the dust on hover; a finger only while it drags.
    let dragging = false;
    const toScene = (e: PointerEvent, active: boolean) =>
      scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2, active);
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
    const onLeave = () => scene.setPointer(0, 0, false);
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
  }, [stats]);

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
