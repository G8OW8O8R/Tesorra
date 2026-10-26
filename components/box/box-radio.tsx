"use client";

import { useEffect, useRef } from "react";
import { useBoxUi } from "@/lib/cart";
import type { Messages } from "@/messages";

/** How long a radio call stays on screen (ms). */
const ON_AIR = 2600;

/**
 * The pit-to-car radio call after something goes into the box: a mono strip along the bottom,
 * BOX, BOX — n items in the box, with the radio waves going out. Read out politely once.
 */
export function BoxRadio({ t }: { t: Messages["box"]["radio"] }) {
  const radio = useBoxUi((s) => s.radio);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current;
    if (!el || !radio) return;
    el.dataset.on = "";
    const timer = window.setTimeout(() => delete el.dataset.on, ON_AIR);
    return () => window.clearTimeout(timer);
  }, [radio]);

  const text = radio ? (radio.count === 1 ? t.one : t.other).replace("{n}", String(radio.count)) : "";

  return (
    <div
      ref={strip}
      role="status"
      className="radio-call label pointer-events-none fixed bottom-[calc(var(--dock-h)+12px)] left-1/2 z-[55] flex h-10 items-center gap-3 border border-line bg-bg/90 px-4 text-[11px] text-fg backdrop-blur-md md:text-xs"
    >
      <svg aria-hidden viewBox="0 0 20 16" className="radio-waves h-4 w-5 shrink-0 text-amber">
        <circle cx="4" cy="8" r="1.6" fill="currentColor" />
        <path d="M8 4.5a5 5 0 0 1 0 7" />
        <path d="M11.5 2a8.5 8.5 0 0 1 0 12" />
        <path d="M15 0a12 12 0 0 1 0 16" />
      </svg>
      <span className="whitespace-nowrap">{text}</span>
    </div>
  );
}
