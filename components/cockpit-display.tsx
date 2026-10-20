"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { Messages } from "@/messages";

/** Progress is quantised to 1/24 so both the 6+6 and the 4+4 rows land on whole lights. */
const STEPS = 24;

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, window.scrollY / max)) * STEPS) / STEPS;
}

/**
 * Shift lights: one row split around the data line. The left half fills from the
 * outside in, the right half from the centre out, shading from dim amber to the
 * current chapter colour.
 */
function shiftLights({
  perSide,
  progress,
  className,
}: {
  perSide: number;
  progress: number;
  className: string;
}) {
  const total = perSide * 2;
  const lit = Math.round(progress * total);

  const light = (index: number) => {
    const mix = Math.round((index / (total - 1)) * 100);
    const colour = `color-mix(in oklab, var(--accent) ${mix}%, color-mix(in oklab, var(--amber) 55%, var(--bg)))`;
    return (
      <span key={index} className="relative size-1.5 rounded-full bg-fg/10 sm:size-[7px]">
        <span
          className="absolute inset-0 rounded-full transition-opacity duration-(--dur-fast) ease-standard"
          style={{
            background: colour,
            boxShadow: `0 0 6px ${colour}`,
            opacity: index < lit ? 1 : 0,
          }}
        />
      </span>
    );
  };

  const side = (from: number) => (
    <span className="flex items-center gap-1.5 sm:gap-2">
      {Array.from({ length: perSide }, (_, i) => light(from + i))}
    </span>
  );

  return { left: <span className={className}>{side(0)}</span>, right: <span className={className}>{side(perSide)}</span> };
}

export function CockpitDisplay({ t }: { t: Messages["nav"] }) {
  const pathname = usePathname() ?? "/";
  const progress = useSyncExternalStore(subscribe, getProgress, () => 0);

  // Live speed and gear arrive with the scroll engine; the car sits in neutral until then.
  const speed = 0;
  const gear = t.neutral;

  const segment = pathname.split("/").filter(Boolean)[1];
  const page = segment ? (t.pages[segment as keyof typeof t.pages] ?? segment.toUpperCase()) : null;

  const wide = shiftLights({ perSide: 6, progress, className: "hidden sm:flex" });
  const narrow = shiftLights({ perSide: 4, progress, className: "flex sm:hidden" });

  return (
    <div role="group" aria-label={t.display} className="flex items-center gap-3 sm:gap-5">
      {wide.left}
      {narrow.left}
      <p className="label flex items-center gap-2 text-[11px] whitespace-nowrap text-fg">
        {page ? (
          <span>{page}</span>
        ) : (
          <span>
            {t.chapter.number}
            <span className="hidden sm:inline"> {t.chapter.name}</span>
          </span>
        )}
        <span aria-hidden className="text-muted">·</span>
        <span>
          <span className="inline-block min-w-[3ch] text-right">{speed}</span>
          <span className="hidden text-muted sm:inline"> {t.speedUnit}</span>
        </span>
        <span aria-hidden className="text-muted">·</span>
        <span className="inline-block min-w-[1ch]">{gear}</span>
      </p>
      {narrow.right}
      {wide.right}
    </div>
  );
}
