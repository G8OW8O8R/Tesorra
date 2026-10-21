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

    return () => {
      resize.disconnect();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
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
