"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { createPortraitHost, type PortraitHost } from "@/lib/scene/portrait-host";
import type { PortraitEvent, PortraitPhoto, PortraitStatus } from "@/lib/scene/portrait-protocol";
import { sceneTuning } from "@/lib/scene-tuning";

export type PortraitSceneHandle = {
  setColour(rgb: [number, number, number], snap?: boolean): void;
  setPhotos(photos: PortraitPhoto[]): void;
  /** Photo `from` falls apart into dust and settles as photo `to`; false if the scene cannot. */
  morph(from: number, to: number): boolean;
};

/**
 * Full-viewport light dust scene behind a driver page: a dimmed field in the driver's colour and
 * the portrait morph. Fades in on its first frame; without WebGL2 the page's colour stays.
 */
export function PortraitCanvas({
  ref,
  colour,
  onEvent,
}: {
  ref?: Ref<PortraitSceneHandle>;
  /** Starting colour, 0..1 sRGB. */
  colour: [number, number, number];
  onEvent?: (event: PortraitEvent) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<PortraitHost | null>(null);
  const start = useRef(colour);
  const state = useRef<{ photos: PortraitPhoto[] | null; colour: [number, number, number] | null }>({
    photos: null,
    colour: null,
  });
  const [status, setStatus] = useState<PortraitStatus>("loading");
  const live = useRef<PortraitStatus>("loading");
  const report = useEffectEvent((event: PortraitEvent) => onEvent?.(event));

  useImperativeHandle(
    ref,
    () => ({
      setColour(rgb, snap) {
        state.current.colour = rgb;
        host.current?.setColour(rgb, snap);
      },
      setPhotos(photos) {
        state.current.photos = photos;
        host.current?.setPhotos(photos);
      },
      morph(from, to) {
        if (!host.current || live.current !== "ready") return false;
        host.current.morph(from, to);
        return true;
      },
    }),
    [],
  );

  useEffect(() => {
    const container = box.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = createPortraitHost(container, {
      mobile: window.matchMedia("(pointer: coarse), (max-width: 767px)").matches,
      reducedMotion: motion.matches,
      colour: state.current.colour ?? start.current,
      onEvent: (event) => {
        if (event.type === "status") {
          live.current = event.status;
          setStatus(event.status);
        }
        report(event);
      },
    });
    if (state.current.photos) scene.setPhotos(state.current.photos);
    host.current = scene;

    const resize = new ResizeObserver(() => scene.resize());
    resize.observe(container);
    const onMotion = () => scene.setReducedMotion(motion.matches);
    motion.addEventListener("change", onMotion);
    const onVisibility = () => scene.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      resize.disconnect();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      scene.destroy();
      host.current = null;
      live.current = "loading";
    };
  }, []);

  return (
    <div aria-hidden data-scene className="pointer-events-none fixed inset-0 z-0">
      <div
        ref={box}
        className="absolute inset-0 transition-opacity ease-out"
        style={{ opacity: status === "ready" ? 1 : 0, transitionDuration: `${sceneTuning.render.fadeIn}ms` }}
      />
    </div>
  );
}
