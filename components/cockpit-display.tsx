"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { getDashboard, HOME_CHAPTERS, rideToStop, subscribeDashboard } from "@/lib/dashboard";
import { writeDigits } from "@/lib/flip-digits";
import type { Messages } from "@/messages";

/** The lights show progress in 1/12 steps, a whole light each. */
const STEPS = 12;

function getProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

/** Two quick flashes of the shift lights on a chapter change. */
const BLINK: Keyframe[] = [1, 0.2, 1, 0.2, 1].map((opacity) => ({ opacity, easing: "steps(1, end)" }));

/**
 * Shift lights: one row split around the data line. The left half fills from the
 * outside in, the right half from the centre out, shading from dim amber to the
 * current chapter colour. Lit by the display's own scroll listener, not by React.
 */
function shiftLights({ perSide, className }: { perSide: number; className: string }) {
  const total = perSide * 2;

  const light = (index: number) => {
    const mix = Math.round((index / (total - 1)) * 100);
    const colour = `color-mix(in oklab, var(--accent) ${mix}%, color-mix(in oklab, var(--amber) 55%, var(--bg)))`;
    return (
      <span key={index} className="relative size-[7px] rounded-full bg-fg/10">
        <span
          data-light={index}
          data-total={total}
          className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--dur-fast) ease-standard"
          style={{ background: colour, boxShadow: `0 0 6px ${colour}` }}
        />
      </span>
    );
  };

  const side = (from: number) => (
    <span data-lights className="flex items-center gap-2">
      {Array.from({ length: perSide }, (_, i) => light(from + i))}
    </span>
  );

  return {
    left: <span className={className}>{side(0)}</span>,
    right: <span className={className}>{side(perSide)}</span>,
  };
}

/**
 * The steering-wheel display. Speed, gear, chapter and lights are written straight into the DOM
 * from the dashboard and the scroll position, so the ride never re-renders the bar. On the home
 * page the chapter is a button: it opens the list of stops under the bar, and a stop rides there.
 * Phones show the data short (01 · 142 · 4) and, in place of the lights, a 2 px progress line in
 * the chapter colour along the bar's lower edge.
 */
export function CockpitDisplay({ t }: { t: Messages["nav"] }) {
  const pathname = usePathname() ?? "/";
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** The list is open, with the chapter that was current when it opened. */
  const [open, setOpen] = useState<number | null>(null);

  const segment = pathname.split("/").filter(Boolean)[1];
  const page = segment ? (t.pages[segment as keyof typeof t.pages] ?? segment.toUpperCase()) : null;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const lights = Array.from(el.querySelectorAll<HTMLElement>("[data-light]"));
    const line = el.querySelector<HTMLElement>("[data-progress]");
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-lights]"));
    const field = (name: string) => el.querySelector<HTMLElement>(`[data-field="${name}"]`);
    const speed = field("speed");
    const gear = field("gear");
    const number = field("number");
    const chapter = field("chapter");
    const write = (node: HTMLElement | null, text: string) => {
      if (node && node.textContent !== text) node.textContent = text;
    };

    let lit = -1;
    let drawn = -1;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const exact = getProgress();
      const share = Math.round(exact * 1000) / 1000;
      if (line && share !== drawn) {
        drawn = share;
        line.style.transform = `scaleX(${share})`;
      }
      const progress = Math.round(exact * STEPS) / STEPS;
      if (progress === lit) return;
      lit = progress;
      for (const light of lights) {
        const on = Number(light.dataset.light) < Math.round(progress * Number(light.dataset.total));
        light.style.opacity = on ? "1" : "0";
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    let blink = 0;
    const off = subscribeDashboard((d) => {
      writeDigits(speed, String(d.kmh));
      write(gear, d.gear === 0 ? t.neutral : String(d.gear));
      const index = d.chapter ?? 0;
      write(number, String(index + 1).padStart(2, "0"));
      write(chapter, ` ${t.chapters[index]}`);
      if (d.blink !== blink) {
        blink = d.blink;
        rows.forEach((row) => row.animate(BLINK, { duration: 420 }));
      }
    });

    return () => {
      off();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [t]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      toggle.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!list.current?.contains(target) && !toggle.current?.contains(target)) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const lights = shiftLights({ perSide: 6, className: "hidden md:flex" });

  return (
    <div ref={root} role="group" aria-label={t.display} className="flex items-center gap-3 md:gap-5">
      <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 md:hidden">
        <span data-progress className="absolute inset-0 origin-left scale-x-0 bg-accent transition-colors duration-(--dur-base) ease-standard" />
      </span>
      {lights.left}
      <div className="label flex items-center gap-2 text-[11px] whitespace-nowrap text-fg">
        {page ? (
          <span>{page}</span>
        ) : (
          <span className="relative">
            <button
              ref={toggle}
              type="button"
              aria-expanded={open !== null}
              aria-controls="stop-list"
              onClick={() => setOpen((current) => (current === null ? (getDashboard().chapter ?? 0) : null))}
              className="label -mx-1.5 px-1.5 py-1 underline decoration-transparent underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-current aria-expanded:text-accent"
            >
              <span className="sr-only">{`${t.stops}: `}</span>
              <span data-field="number">01</span>
              <span data-field="chapter" className="hidden md:inline">
                {` ${t.chapters[0]}`}
              </span>
            </button>
            {open !== null ? (
              <div
                ref={list}
                id="stop-list"
                className="absolute top-[calc(100%+0.85rem)] left-1/2 z-50 -translate-x-1/2 border border-line bg-bg/95 px-4 py-2"
              >
                <ol aria-label={t.stops}>
                  {t.chapters.map((name, i) => (
                    <li key={name}>
                      <button
                        type="button"
                        aria-current={i === open ? "location" : undefined}
                        onClick={() => {
                          setOpen(null);
                          rideToStop(i);
                        }}
                        className="label flex h-8 w-full items-center gap-3 text-[11px] text-muted transition-colors duration-(--dur-fast) ease-standard hover:text-fg aria-[current=location]:text-(--current)"
                        style={{ "--current": `var(--chapter-${HOME_CHAPTERS[i]})` } as CSSProperties}
                      >
                        <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                        <span>{name}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </span>
        )}
        <span aria-hidden className="text-muted">·</span>
        <span>
          <span data-field="speed" className="inline-block min-w-[3ch] text-right">
            0
          </span>
          <span className="hidden text-muted md:inline"> {t.speedUnit}</span>
        </span>
        <span aria-hidden className="text-muted">·</span>
        <span data-field="gear" className="inline-block min-w-[1ch]">
          {t.neutral}
        </span>
      </div>
      {lights.right}
    </div>
  );
}
