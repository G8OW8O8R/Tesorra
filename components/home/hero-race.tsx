"use client";

import { useEffect, useRef } from "react";
import { roundStart, upcomingRounds } from "@/content/season";
import { writeDigits } from "@/lib/flip-digits";
import type { Messages } from "@/messages";

const UNITS = ["days", "hours", "minutes"] as const;
const two = (n: number) => String(n).padStart(2, "0");

/**
 * The opening view's line on the next race: NEXT RACE · 06D 14H 32M · WROCŁAW, ticking each minute
 * (the digits flip as they change) by writing into its own nodes. Gone once the season is over.
 */
export function HeroRace({ label, units }: { label: string; units: Messages["home"]["live"]["units"] }) {
  const root = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cells = UNITS.map((unit) => el.querySelector<HTMLElement>(`[data-unit="${unit}"]`));
    const city = el.querySelector<HTMLElement>("[data-city]");
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      const next = upcomingRounds(new Date(now), 1)[0];
      el.hidden = !next;
      if (!next) return;
      const left = Math.max(0, Math.floor((roundStart(next).getTime() - now) / 60000));
      const values = [Math.floor(left / 1440), Math.floor((left % 1440) / 60), left % 60];
      values.forEach((v, i) => writeDigits(cells[i], two(v)));
      if (city && city.textContent !== next.city) city.textContent = next.city;
      el.setAttribute("aria-label", `${label}: ${values.map((v, i) => `${two(v)} ${units[UNITS[i]]}`).join(" ")}, ${next.city}`);
      // Next tick just after the minute turns.
      timer = window.setTimeout(tick, 60000 - (now % 60000) + 20);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [label, units]);

  return (
    <p ref={root} role="timer" className="label flex items-center gap-x-[0.6em] [&[hidden]]:hidden text-[11px] leading-5 whitespace-nowrap text-fg sm:text-xs">
      <span aria-hidden>{label}</span>
      <span aria-hidden className="text-muted">·</span>
      <span aria-hidden className="flex gap-[0.5em] tabular-nums">
        {UNITS.map((unit) => (
          <span key={unit} className="flex">
            <span data-unit={unit}>--</span>
            {units[unit]}
          </span>
        ))}
      </span>
      <span aria-hidden className="text-muted">·</span>
      <span aria-hidden data-city />
      <span aria-hidden className="pulse-dot ml-[0.2em] size-[0.55em] rounded-full bg-amber" />
    </p>
  );
}
