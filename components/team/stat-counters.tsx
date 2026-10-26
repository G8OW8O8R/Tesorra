"use client";

import { useEffect, useRef } from "react";
import { formatStat, type Stat } from "@/content/team";

/** Counters run up to their values over this long (ms), easing out. */
const COUNT_MS = 1200;

/**
 * The driver's career numbers in one mono line (EVENTS 42 / WINS 6 / …). Each runs up from zero to
 * its value when the driver comes on, written straight into the DOM.
 */
export function StatCounters({
  stats,
  labels,
  label,
  className = "",
}: {
  stats: Stat[];
  labels: Record<string, string>;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDListElement>(null);
  const key = stats.map((s) => `${s.key}${s.value}`).join();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-value]"));
    const write = (t: number) =>
      nodes.forEach((node, i) => {
        const s = stats[i];
        node.textContent = formatStat(s.value * t, s.format);
      });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return write(1);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      write(1 - (1 - t) ** 3);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    write(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `key` stands for the stats: they only change with the driver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <dl ref={ref} aria-label={label} className={`label flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      {stats.map((s, i) => (
        <div
          key={s.key}
          className={`flex gap-2 ${i > 0 ? "md:before:mr-1 md:before:text-muted md:before:content-['/']" : ""}`}
        >
          <dt className="text-muted">{labels[s.key] ?? s.key}</dt>
          <dd className="tabular-nums">
            <span data-value>{formatStat(s.value, s.format)}</span>
            {s.unit ? (s.unit === "°" ? s.unit : ` ${s.unit}`) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
