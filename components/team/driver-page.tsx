"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { getSmoothScroll } from "@/components/smooth-scroll";
import { PortraitCanvas, type PortraitSceneHandle } from "@/components/scene/portrait-canvas";
import { Picture } from "@/components/ui/picture";
import { Reveal } from "@/components/ui/reveal";
import { ScreenBlock } from "@/components/ui/screen-block";
import type { Driver } from "@/content/team";
import type { Locale } from "@/lib/i18n";
import { images } from "@/lib/images";
import type { PortraitPhoto } from "@/lib/scene/portrait-protocol";
import type { Messages } from "@/messages";
import { FlapNumber } from "./flap-number";
import { HelmetArchive } from "./helmet-archive";
import { PaddockFan } from "./paddock-fan";
import { Signature } from "./signature";
import { StatCounters } from "./stat-counters";

type T = Messages["team"];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where each portrait is on screen, which part of it shows and its oval, for the dust scene. */
function portraitGeometry(box: HTMLElement, drivers: Driver[]): PortraitPhoto[] {
  const r = box.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const style = getComputedStyle(box.querySelector("img") ?? box);
  const share = (name: string, fallback: number) => {
    const v = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(v) ? v / 100 : fallback;
  };
  const mask = { cy: share("--mcy", 0.55), rx: share("--mrx", 0.5), ry: share("--mry", 0.6) };
  return drivers.map((d) => {
    const img = images[d.portrait];
    const [fx, fy] = d.portraitFocus;
    // object-fit: cover with object-position at the focus.
    const scale = Math.max(r.width / img.width, r.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const u0 = ((w - r.width) * fx) / w;
    const v0 = ((h - r.height) * fy) / h;
    return {
      url: img.webp.find((s) => s.width >= 1280)?.src ?? img.webp.at(-1)!.src,
      rect: [r.left / vw, r.top / vh, r.right / vw, r.bottom / vh],
      crop: [u0, v0, u0 + r.width / w, v0 + r.height / h],
      mask: [fx, mask.cy, mask.rx, mask.ry],
    };
  });
}

/**
 * The opening view of a driver page, after the mock-up: the huge outlined number in the driver's
 * colour behind the portrait (masked to a soft oval, so it stands out of the dust like a cut-out),
 * the surname up the left edge, career counters and the signature bottom left.
 */
function DriverHero({
  drivers,
  active,
  shown,
  photoBox,
  t,
}: {
  drivers: Driver[];
  active: number;
  shown: number | null;
  photoBox: RefObject<HTMLDivElement | null>;
  t: T;
}) {
  const d = drivers[active];
  const nameBox = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLHeadingElement>(null);

  // The surname runs the full height left to it (and no wider than a column), then rises in.
  useLayoutEffect(() => {
    const box = nameBox.current;
    const el = name.current;
    if (!box || !el) return;
    const fit = () => {
      el.style.fontSize = "100px";
      const length = Math.max(1, el.offsetHeight);
      const column = window.innerWidth * (window.innerWidth < 768 ? 0.15 : 0.1);
      el.style.fontSize = `${Math.min((100 * box.clientHeight) / length, column / 0.82)}px`;
    };
    fit();
    const raf = requestAnimationFrame(() => el.setAttribute("data-on", ""));
    const resize = new ResizeObserver(fit);
    resize.observe(box);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, [active]);

  return (
    <section
      aria-labelledby="driver-name"
      className="relative z-10 h-[calc(100svh-var(--bar-h))] min-h-[34rem] overflow-hidden"
    >
      <div
        className="absolute inset-x-0 top-0 flex h-[62%] items-center justify-center transition-colors duration-(--dur-slow) ease-standard md:inset-0 md:h-auto md:pl-[12vw]"
        style={{ color: d.colour }}
      >
        <FlapNumber value={d.number} className="text-[60vw] md:text-[min(96svh,52vw)]" />
      </div>

      <div ref={photoBox} className="absolute inset-x-0 top-0 h-[62%] md:inset-0 md:h-auto">
        {drivers.map((p, i) => (
          <Picture
            key={p.slug}
            image={p.portrait}
            alt={i === active ? t.drivers[p.key].portraitAlt : ""}
            aria-hidden={i !== active}
            sizes="100vw"
            loading={i === active ? "eager" : "lazy"}
            fetchPriority={i === active ? "high" : "low"}
            className="portrait-photo portrait-mask absolute inset-0 size-full object-cover"
            style={
              {
                objectPosition: `${p.portraitFocus[0] * 100}% ${p.portraitFocus[1] * 100}%`,
                "--mcx": `${p.portraitFocus[0] * 100}%`,
                opacity: shown === i ? 1 : 0,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div
        ref={nameBox}
        className="absolute top-4 bottom-[40%] left-(--gutter) md:top-6 md:bottom-[calc(var(--dock-h)+32px+7.5rem)]"
      >
        <h1
          key={d.slug}
          ref={name}
          id="driver-name"
          aria-label={`${d.firstName} ${d.lastName}`}
          className="v-name headline uppercase"
          style={{ color: d.colour }}
        >
          {Array.from(d.lastName.toUpperCase()).map((ch, i) => (
            <span key={i} aria-hidden className="v-letter" style={{ "--i": i } as CSSProperties}>
              {ch}
            </span>
          ))}
        </h1>
      </div>

      <div className="absolute inset-x-(--gutter) bottom-[calc(var(--dock-h)+32px)] flex flex-col gap-2 md:gap-3">
        <p className="label text-[11px] text-muted">
          #{d.number} · {t.disciplines[d.discipline]} · {t.countries[d.country as keyof T["countries"]]}
        </p>
        <StatCounters
          stats={d.stats}
          labels={t.stats}
          label={t.statsLabel}
          className="grid grid-cols-2 text-[12px] md:flex md:text-[15px]"
        />
        <Signature
          key={d.slug}
          on
          driver={d.key}
          label={fill(t.signature, { name: `${d.firstName} ${d.lastName}` })}
          className="mt-1 w-[200px] md:w-[300px]"
          style={{ color: d.colour, "--sig-delay": "700ms" } as CSSProperties}
        />
      </div>
    </section>
  );
}

/**
 * A driver page: the hero, bio and quote, the paddock fan and the helmet archive, with the tabs
 * 21 / 08 / 36 in the dock. A tab changes the URL without leaving the page: the portrait falls
 * apart into dust and settles as the next driver (cross-fade under reduced motion), the number
 * rolls, the dust takes the new colour and the rest of the page rides in again.
 */
export function DriverPage({
  lang,
  t,
  drivers,
  initial,
}: {
  lang: Locale;
  t: T;
  drivers: Driver[];
  initial: number;
}) {
  const [active, setActive] = useState(initial);
  /** Portrait shown in the page (none while the dust scene draws the morph). */
  const [shown, setShown] = useState<number | null>(initial);
  const target = useRef(initial);
  const scene = useRef<PortraitSceneHandle>(null);
  const photoBox = useRef<HTMLDivElement>(null);
  const d = drivers[active];

  const go = (next: number, push: boolean) => {
    if (next === target.current) return;
    const from = target.current;
    target.current = next;
    const driver = drivers[next];
    if (push) window.history.pushState(null, "", `/${lang}/team/${driver.slug}`);
    setActive(next);
    scene.current?.setColour(rgb(driver.colour));
    if (reduced() || !scene.current?.morph(from, next)) setShown(next);
    if (window.scrollY > window.innerHeight * 0.5) {
      const smooth = getSmoothScroll();
      if (smooth) smooth.scrollTo(0, { duration: 1.1 });
      else window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    }
  };

  const onTab = (e: MouseEvent<HTMLAnchorElement>, i: number) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go(i, true);
  };

  // Back and forward between drivers stay on the page.
  useEffect(() => {
    const onPop = () => {
      const slug = window.location.pathname.split("/")[3];
      const i = drivers.findIndex((p) => p.slug === slug);
      if (i >= 0) go(i, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // `go` only reads refs and stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers]);

  useEffect(() => {
    document.title = `${d.firstName} ${d.lastName} #${d.number} — Tesorra Racing`;
  }, [d]);

  // The bar and the page take the driver's colour.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", d.colour);
    return () => {
      root.style.removeProperty("--accent");
    };
  }, [d.colour]);

  // The scene learns where the portraits are; the hero scrolls, so it follows the page.
  useEffect(() => {
    const box = photoBox.current;
    if (!box) return;
    let raf = 0;
    const send = () => {
      raf = 0;
      scene.current?.setPhotos(portraitGeometry(box, drivers));
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(send);
    };
    send();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, [drivers]);

  const copy = t.drivers[d.key];

  return (
    <div className="relative pb-(--dock-h)">
      <PortraitCanvas
        ref={scene}
        colour={rgb(drivers[initial].colour)}
        onEvent={(event) => {
          if (event.type !== "morph") return;
          setShown(event.stage === "start" ? null : target.current);
        }}
      />

      <DriverHero drivers={drivers} active={active} shown={shown} photoBox={photoBox} t={t} />

      <ScreenBlock aria-labelledby="profile">
        <Reveal key={d.slug} className="relative mx-auto grid max-w-6xl gap-10 md:grid-cols-12 md:gap-6">
          <Signature
            driver={d.key}
            weight={0.8}
            className="pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-30 md:w-full"
            style={{ color: d.colour, "--sig-time": "2600ms", "--sig-delay": "200ms" } as CSSProperties}
          />
          <h2 id="profile" data-enter className="label text-[11px] text-muted md:col-span-12">
            {t.profile} — #{d.number}
          </h2>
          <p data-enter className="text-[clamp(18px,1.55vw,24px)] leading-snug md:col-span-6" style={{ "--i": 1 } as CSSProperties}>
            {copy.bio}
          </p>
          <figure data-enter className="md:col-span-5 md:col-start-8" style={{ "--i": 2 } as CSSProperties}>
            <blockquote className="quote text-[clamp(30px,3.4vw,54px)] leading-[1.04]">{copy.quote}</blockquote>
            <figcaption className="label mt-5 text-[11px] text-muted">
              — {d.firstName} #{d.number}
            </figcaption>
          </figure>
        </Reveal>
      </ScreenBlock>

      <PaddockFan
        key={`fan-${d.slug}`}
        images={d.paddock}
        captions={t.paddockCaptions}
        label={t.paddock}
        help={t.paddockHelp}
      />

      <HelmetArchive key={`helmets-${d.slug}`} lang={lang} driver={d} t={t} />

      <nav
        aria-label={t.driversLabel}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex h-(--dock-h) items-center justify-center px-(--gutter) pb-[env(safe-area-inset-bottom)] md:justify-end"
      >
        <div className="panel label pointer-events-auto flex items-center p-1 text-[13px]">
          {drivers.map((p, i) => (
            <Fragment key={p.slug}>
              {i > 0 ? (
                <span aria-hidden className="px-1 text-muted">
                  /
                </span>
              ) : null}
              <a
                href={`/${lang}/team/${p.slug}`}
                aria-current={i === active ? "page" : undefined}
                aria-label={fill(t.switchTo, { number: p.number, name: `${p.firstName} ${p.lastName}` })}
                onClick={(e) => onTab(e, i)}
                className={`px-3 py-1.5 transition-colors duration-(--dur-fast) ease-standard ${
                  i === active ? "text-bg" : "text-muted hover:text-fg"
                }`}
                style={i === active ? { background: p.colour } : undefined}
              >
                {p.number}
              </a>
            </Fragment>
          ))}
        </div>
      </nav>
    </div>
  );
}
