"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getSmoothScroll } from "@/components/smooth-scroll";
import { Picture } from "@/components/ui/picture";
import { PitBoard } from "@/components/ui/pit-board";
import { Reveal } from "@/components/ui/reveal";
import type { Driver } from "@/content/team";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";

/** Each column's offset (svh) and how fast it moves against the scroll (share of it), desktop only. */
const COLUMNS = [
  { offset: 0, speed: -0.06 },
  { offset: 16, speed: 0.1 },
  { offset: 6, speed: -0.02 },
];

/**
 * The driver's special helmets as pit-board cards in three columns set at different heights and
 * moving at different speeds as the page scrolls. Hover turns a card's frame amber and slides the
 * studio shot over to the driver wearing it, where there is one; a click opens the helmet full
 * screen with its year and story (Esc closes).
 */
export function HelmetArchive({ lang, driver, t }: { lang: Locale; driver: Driver; t: Messages["team"] }) {
  const section = useRef<HTMLElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [worn, setWorn] = useState(false);

  useEffect(() => {
    const root = section.current;
    if (!root) return;
    const wide = window.matchMedia("(min-width: 768px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const place = () => {
      raf = 0;
      const moving = wide.matches && !motion.matches;
      const r = root.getBoundingClientRect();
      const off = r.top + r.height / 2 - window.innerHeight / 2;
      columns.current.forEach((col, i) => {
        if (col) col.style.translate = moving ? `0 ${(off * COLUMNS[i].speed).toFixed(1)}px` : "";
      });
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el || open === null) return;
    el.showModal();
    getSmoothScroll()?.stop();
    document.documentElement.style.overflow = "hidden";
    return () => {
      getSmoothScroll()?.start();
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const helmet = open === null ? null : driver.helmets[open];
  const story = (slug: string) => t.helmetStories[`${driver.number}-${slug}` as keyof typeof t.helmetStories];

  return (
    <section ref={section} aria-labelledby="helmets" className="relative z-10 px-(--gutter) pt-[10svh] pb-[22svh]">
      <Reveal className="mx-auto max-w-6xl">
        <p data-enter className="label text-[11px] text-muted">
          #{driver.number} · {driver.helmets.length}
        </p>
        <h2
          id="helmets"
          data-enter
          className="headline mt-3 text-[clamp(40px,6vw,96px)] leading-[0.9]"
          style={{ "--i": 1 } as CSSProperties}
        >
          {t.helmets}
        </h2>
      </Reveal>

      <Reveal className="mx-auto mt-12 grid max-w-6xl gap-6 md:mt-16 md:grid-cols-3 md:gap-8">
        {driver.helmets.map((h, i) => (
          <div
            key={h.slug}
            ref={(node) => {
              columns.current[i] = node;
            }}
            className="md:mt-(--col-offset)"
            style={{ "--col-offset": `${COLUMNS[i].offset}svh` } as CSSProperties}
          >
            <div data-enter style={{ "--i": i } as CSSProperties}>
              <PitBoard
                title={`#${driver.number}  ${h.name.toUpperCase()}`}
                meta={h.year}
                className="group transition-colors duration-(--dur-base) ease-standard hover:border-amber has-[:focus-visible]:border-amber"
              >
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={t.helmetOpen.replace("{name}", h.name)}
                  onClick={() => {
                    setWorn(false);
                    setOpen(i);
                  }}
                  className="relative block aspect-[4/5] w-full overflow-hidden focus-visible:outline-none"
                >
                  <Picture
                    image={h.image}
                    alt=""
                    sizes="(min-width: 768px) 30vw, 92vw"
                    className={`absolute inset-0 size-full object-contain p-[12%] transition-[opacity,translate,scale] duration-300 ease-out ${
                      h.worn
                        ? "group-hover:-translate-x-[6%] group-hover:opacity-0"
                        : "group-hover:-translate-y-[2%] group-hover:scale-[1.04]"
                    }`}
                  />
                  {h.worn ? (
                    <Picture
                      image={h.worn}
                      alt=""
                      sizes="(min-width: 768px) 30vw, 92vw"
                      className="absolute inset-0 size-full translate-x-[6%] object-cover opacity-0 transition-[opacity,translate] duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100"
                    />
                  ) : null}
                </button>
              </PitBoard>
            </div>
          </div>
        ))}
      </Reveal>

      <div className="mx-auto mt-[12svh] max-w-6xl text-center md:mt-[22svh]">
        <Link
          href={`/${lang}#live`}
          className="label text-[12px] text-fg underline decoration-line underline-offset-8 transition-colors duration-(--dur-fast) ease-standard hover:text-amber hover:decoration-amber"
        >
          {t.helmetsLink} →
        </Link>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="helmet-name"
        className="helmet-dialog"
        onClose={() => setOpen(null)}
      >
        {helmet ? (
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-6 overflow-y-auto p-(--gutter) md:grid-cols-12 md:grid-rows-1 md:gap-10">
            <div className="relative min-h-[40svh] md:col-span-7">
              <Picture
                image={worn && helmet.worn ? helmet.worn : helmet.image}
                alt={`${helmet.name}, ${helmet.year}`}
                sizes="(min-width: 768px) 58vw, 100vw"
                loading="eager"
                className={`absolute inset-0 size-full ${worn && helmet.worn ? "object-cover" : "object-contain p-[6%]"}`}
              />
            </div>
            <div className="flex flex-col justify-end gap-5 pb-4 md:col-span-5 md:justify-center">
              <p className="label text-[11px] text-muted">
                #{driver.number} · {helmet.year}
              </p>
              <h2 id="helmet-name" className="headline text-[clamp(48px,7vw,112px)] leading-[0.9]" style={{ color: driver.colour }}>
                {helmet.name}
              </h2>
              <p className="max-w-[34rem] text-[17px] leading-relaxed text-fg/90">{story(helmet.slug)}</p>
              {helmet.worn ? (
                <div className="label flex gap-1 text-[11px]">
                  {([false, true] as const).map((on) => (
                    <button
                      key={String(on)}
                      type="button"
                      aria-pressed={worn === on}
                      onClick={() => setWorn(on)}
                      className={`border px-3 py-1.5 transition-colors duration-(--dur-fast) ease-standard ${
                        worn === on ? "border-amber text-fg" : "border-line text-muted hover:text-fg"
                      }`}
                    >
                      {on ? t.onTrack : t.studio}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          autoFocus
          onClick={() => dialog.current?.close()}
          className="label fixed top-3 right-(--gutter) h-8 px-2 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:text-amber"
        >
          {t.close}
        </button>
      </dialog>
    </section>
  );
}
