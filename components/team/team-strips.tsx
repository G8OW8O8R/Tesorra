"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Picture } from "@/components/ui/picture";
import type { Driver } from "@/content/team";
import type { Locale } from "@/lib/i18n";
import { images } from "@/lib/images";
import type { Messages } from "@/messages";

/** Share of the width the hovered strip takes; the others split the rest. */
const WIDE = 0.5;

/** Strip edges (shares of the width) with strip `hovered` widened, or all equal. */
function edges(n: number, hovered: number | null) {
  const widths = Array.from({ length: n }, (_, i) =>
    hovered === null ? 1 / n : i === hovered ? WIDE : (1 - WIDE) / (n - 1),
  );
  return widths.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [0]);
}

function StripText({ d, t, wide }: { d: Driver; t: Messages["team"]; wide: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className="headline block text-[clamp(96px,13vw,240px)] leading-[0.85] text-transparent"
        style={{ WebkitTextStroke: `1.5px ${d.colour}` }}
      >
        {d.number}
      </span>
      <span className="mt-auto flex flex-col gap-3">
        <span className="label text-[11px] text-muted">
          {t.disciplines[d.discipline]} · {d.country}
        </span>
        <span className="headline text-[clamp(32px,3.4vw,60px)] leading-[0.92]">
          {d.firstName}
          <br />
          <span style={{ color: d.colour }}>{d.lastName}</span>
        </span>
        <span
          className={`label text-[11px] text-fg transition-opacity duration-(--dur-base) ease-standard ${
            wide ? "opacity-100" : "opacity-0"
          }`}
        >
          {t.view} →
        </span>
      </span>
    </>
  );
}

/**
 * The team page opening: the three drivers as full-height vertical strips, each a photo with the
 * car or bike, the outlined number and the name. The hovered strip widens: each strip is a full
 * layer clipped to its band, and its photo slides to keep the driver in the middle of it, so all
 * the movement is clipping and transforms. Phones stack the strips.
 */
export function TeamStrips({ lang, drivers, t }: { lang: Locale; drivers: Driver[]; t: Messages["team"] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  /** Box size once measured; until then the photos simply cover their layers. */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const resize = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    resize.observe(el);
    return () => resize.disconnect();
  }, []);

  const at = edges(drivers.length, hovered);

  return (
    <>
      <div
        ref={box}
        className="relative z-10 hidden h-[calc(100svh-var(--bar-h))] overflow-hidden md:block"
        onPointerLeave={() => setHovered(null)}
      >
        {drivers.map((d, i) => {
          const left = at[i];
          const right = at[i + 1];
          const img = images[d.vehicle];
          // The photo covers the whole box; it slides so the driver stands mid-strip.
          const imgW = size ? Math.max(size.w, (size.h * img.width) / img.height) : 0;
          const shift = size
            ? Math.min(
                left * size.w,
                Math.max(right * size.w - imgW, ((left + right) / 2) * size.w - d.vehicleFocus[0] * imgW),
              )
            : 0;
          const dim = hovered !== null && hovered !== i;
          return (
            <Link
              key={d.slug}
              href={`/${lang}/team/${d.slug}`}
              aria-label={`${d.firstName} ${d.lastName} #${d.number}`}
              onPointerEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              className="strip-layer absolute inset-0 block focus-visible:outline-none"
              style={{ clipPath: `inset(0 ${(1 - right) * 100}% 0 ${left * 100}%)` }}
            >
              <div
                className={`absolute inset-y-0 left-0 ${size ? "strip-move" : "w-full"}`}
                style={size ? { width: imgW, translate: `${shift}px 0` } : undefined}
              >
                <Picture
                  image={d.vehicle}
                  alt={t.drivers[d.key].vehicleAlt}
                  sizes="100vw"
                  loading="eager"
                  className={`hero-enter size-full object-cover transition-opacity duration-(--dur-slow) ease-standard ${
                    dim ? "opacity-45" : "opacity-100"
                  }`}
                  style={{ "--i": i, objectPosition: `${((i + 0.5) / drivers.length) * 100}% 50%` } as CSSProperties}
                />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(11_13_20/0.85),rgb(11_13_20/0)_55%)]"
              />
              <div
                className="strip-move absolute inset-y-0 left-0 flex w-1/4 flex-col border-l border-line px-6 pt-6 pb-[calc(var(--dock-h)+32px)]"
                style={{ translate: `${left * 400}% 0` }}
              >
                <div className="hero-enter flex flex-1 flex-col" style={{ "--i": i + 1 } as CSSProperties}>
                  <StripText d={d} t={t} wide={hovered === i} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="relative z-10 flex flex-col md:hidden">
        {drivers.map((d, i) => (
          <Link
            key={d.slug}
            href={`/${lang}/team/${d.slug}`}
            aria-label={`${d.firstName} ${d.lastName} #${d.number}`}
            className="hero-enter relative isolate flex h-[62svh] flex-col overflow-hidden border-b border-line px-(--gutter) pt-5 pb-8"
            style={{ "--i": i } as CSSProperties}
          >
            <Picture
              image={d.vehicle}
              alt={t.drivers[d.key].vehicleAlt}
              sizes="100vw"
              loading={i === 0 ? "eager" : "lazy"}
              className="absolute inset-0 -z-10 size-full object-cover"
              style={{ objectPosition: `${d.vehicleFocus[0] * 100}% 50%` }}
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(11_13_20/0.9),rgb(11_13_20/0)_60%)]"
            />
            <StripText d={d} t={t} wide />
          </Link>
        ))}
      </div>
    </>
  );
}
