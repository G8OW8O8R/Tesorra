"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Picture } from "@/components/ui/picture";
import {
  disciplineDriver,
  roundEnd,
  roundDayMonth,
  roundStart,
  season,
  upcomingRounds,
  type Discipline,
  type Round,
} from "@/content/season";
import { writeDigits } from "@/lib/flip-digits";
import { buildIcs, downloadIcs } from "@/lib/ics";
import type { Locale } from "@/lib/i18n";
import type { ImageKey } from "@/lib/images";
import type { Messages } from "@/messages";

type LiveText = Messages["home"]["live"];

/** The list moves on to the next round at most every 15 s. */
const TICK = 15_000;

function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, TICK);
  return () => clearInterval(id);
}
const clockNow = () => Math.floor(Date.now() / TICK);
const serverClock = () => null;

/** Rounds still to come; before the clock is read (server render), from the first round of the season. */
function upcoming(now: number | null, count?: number) {
  return upcomingRounds(new Date(now ?? Date.parse(season.rounds[0].start) - 1), count);
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Thumbnail for a round, by discipline. */
const THUMB: Record<Discipline, ImageKey> = {
  drift: "events/drift-arena",
  formula: "events/street-circuit",
  moto: "events/moto-corner",
};

const UNITS = ["days", "hours", "minutes", "seconds"] as const;
const two = (n: number) => String(n).padStart(2, "0");

/**
 * Countdown to the next start, D H M S, and the round it counts to. It ticks every second by
 * writing straight into its own nodes (each digit flips as it changes), so React never re-renders it.
 */
export function LiveCountdown({ t }: { t: LiveText }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cells = UNITS.map((unit) => el.querySelector<HTMLElement>(`[data-unit="${unit}"]`));
    const clock = el.querySelector<HTMLElement>("[data-clock]");
    const line = el.querySelector<HTMLElement>("[data-round]");
    const write = (node: HTMLElement | null, text: string) => {
      if (node && node.textContent !== text) node.textContent = text;
    };
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      const next = upcomingRounds(new Date(now), 1)[0];
      if (!next) {
        write(line, t.over);
        cells.forEach((cell) => writeDigits(cell, "00"));
        return;
      }
      const left = Math.max(0, Math.floor((roundStart(next).getTime() - now) / 1000));
      const values = [Math.floor(left / 86400), Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60];
      values.forEach((v, i) => writeDigits(cells[i], two(v)));
      write(line, fill(t.round, { round: next.round, discipline: t.disciplines[next.discipline], city: next.city }));
      // Screen readers get the minutes, not a change every second.
      clock?.setAttribute(
        "aria-label",
        `${t.countdown}: ${values
          .slice(0, 3)
          .map((v, i) => `${two(v)} ${t.units[UNITS[i]]}`)
          .join(" ")}`,
      );
      // Next tick just after the second turns.
      timer = window.setTimeout(tick, 1000 - (now % 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [t]);

  return (
    <div ref={root} className="mt-2">
      {/*
        Phones run it across the full width. Sizes and gaps are in the digits' em: each unit keeps
        0.18em clear of its digits and sits on their baseline.
      */}
      <p
        data-clock
        role="timer"
        className="label flex items-baseline justify-between text-[13vw] leading-none text-fg md:flex-wrap md:justify-start md:gap-x-[0.42em] md:text-[clamp(2.6rem,6.2vw,6.5rem)]"
      >
        {UNITS.map((unit) => (
          <span key={unit} aria-hidden className="flex items-baseline gap-[0.18em]">
            <span data-unit={unit} className="tabular-nums">
              --
            </span>
            <span className="text-[0.34em] tracking-normal text-amber">{t.units[unit]}</span>
          </span>
        ))}
      </p>
      <p data-round className="label mt-2 text-xs text-muted normal-case md:mt-3 md:text-sm" />
    </div>
  );
}

/**
 * The rounds still to come, one hairline-separated row each: date, venue thumbnail, city and
 * discipline, a calendar file. The first is the round the countdown counts to. Then the stream link,
 * closed until race day.
 */
export function LiveRounds({ lang, t }: { lang: Locale; t: LiveText }) {
  const now = useSyncExternalStore(subscribeClock, clockNow, serverClock);
  const rounds = upcoming(now === null ? null : now * TICK, 5);

  const addToCalendar = (r: Round) => {
    const text = buildIcs({
      uid: `${r.slug}-${season.year}@tesorra.racing`,
      title: fill(t.calendarTitle, { round: r.round, name: r.name }),
      start: roundStart(r),
      end: roundEnd(r),
      location: `${r.venue}, ${r.city}, ${r.country}`,
      description: fill(t.calendarNote, { discipline: r.discipline.toUpperCase(), driver: disciplineDriver[r.discipline] }),
      url: new URL(`/${lang}#live`, window.location.origin).href,
    });
    downloadIcs(text, `tesorra-r${r.round}-${r.slug}`);
  };

  return (
    <div className="w-full">
      {rounds.length > 0 && (
        <ul aria-label={t.upcoming} className="border-t border-line">
          {rounds.map((r, i) => (
            <li
              key={r.slug}
              className={`relative grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-line py-2 max-md:nth-[n+4]:hidden md:grid-cols-[3.4rem_4.5rem_1fr_auto] md:py-2.5 ${
                i === 0 ? "text-fg" : "text-fg/70"
              }`}
            >
              {i === 0 ? <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-px bg-accent" /> : null}
              <span className="label text-sm tabular-nums">{roundDayMonth(r, lang)}</span>
              <span className={`relative hidden aspect-[16/10] overflow-hidden bg-bg md:block ${i === 0 ? "" : "opacity-70"}`}>
                <Picture image={THUMB[r.discipline]} alt="" sizes="72px" className="size-full object-cover" />
              </span>
              <span className="min-w-0">
                <span className="label block text-sm break-words">{r.city.toUpperCase()}</span>
                <span className="label block text-[11px]" style={{ color: `var(--chapter-${r.discipline})` }}>
                  {r.discipline.toUpperCase()}
                </span>
              </span>
              <button
                type="button"
                aria-label={fill(t.addToCalendarFor, { name: `R${r.round} ${r.name}` })}
                onClick={() => addToCalendar(r)}
                className="label text-[11px] whitespace-nowrap normal-case underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-current"
              >
                {t.addToCalendar}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="label mt-3 text-[11px] normal-case md:mt-4">
        <span aria-disabled="true" className="text-fg/50 underline decoration-line underline-offset-4">
          {t.watch}
        </span>
        <span className="text-muted"> · {t.watchNote}</span>
      </p>
    </div>
  );
}
