"use client";

import { type CSSProperties, type RefObject, useEffect, useRef } from "react";
import { clamp, smoothstep } from "@/lib/scene/math";

/** The field's colours from top to bottom: night blue, warm amber-brown, graphite (two pools each). */
const STRETCHES = [
  ["#22365e", "#16233f"],
  ["#6a4322", "#3f2a18"],
  ["#36383e", "#24262b"],
] as const;

/**
 * Soft pools of colour lit into the dust behind the float field, shading along it from night blue
 * through warm amber-brown to graphite and fading out as the field gives way to the footer.
 */
export function FieldBackdrop({ field }: { field: RefObject<HTMLElement | null> }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layers = Array.from(box.current?.children ?? []) as HTMLElement[];
    const update = () => {
      const el = field.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const view = window.innerHeight;
      const progress = clamp(-rect.top / Math.max(1, rect.height - view), 0, 1);
      // Out as the field's end rises past the middle of the screen.
      const shown = smoothstep(view * 0.15, view * 0.9, rect.bottom);
      const weights = [1 - smoothstep(0.05, 0.5, progress), 0, smoothstep(0.5, 0.95, progress)];
      weights[1] = 1 - weights[0] - weights[2];
      layers.forEach((layer, i) => {
        layer.style.opacity = (weights[i] * shown).toFixed(3);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [field]);

  return (
    <div ref={box} aria-hidden className="field-backdrop pointer-events-none fixed inset-0 z-[1]">
      {STRETCHES.map(([c1, c2], i) => (
        <div
          key={c1}
          className="field-glow absolute inset-0"
          style={{ "--c1": c1, "--c2": c2, opacity: i === 0 ? 1 : 0 } as CSSProperties}
        />
      ))}
    </div>
  );
}
