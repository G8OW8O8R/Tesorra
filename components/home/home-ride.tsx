"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect, useRef, type CSSProperties } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { DustCanvas, type DustSceneHandle } from "@/components/scene/dust-canvas";
import { Picture } from "@/components/ui/picture";
import { HOME_CHAPTERS, resetDashboard, setRideHandler, TOP_KMH, updateDashboard } from "@/lib/dashboard";
import type { Locale } from "@/lib/i18n";
import { intro } from "@/lib/motion-tokens";
import { chapterAt, chapterColour, getRide } from "@/lib/scene/choreography";
import { clamp } from "@/lib/scene/math";
import type { SceneFrame } from "@/lib/scene/protocol";
import { sceneTuning } from "@/lib/scene-tuning";
import type { Messages } from "@/messages";
import { ChapterStop } from "./chapter-stop";
import { LiveCountdown, LiveRounds } from "./live-stop";
import { INTRO_DELAY } from "./start-lights";
import { dissolveIntercept, StoreFloat } from "./store-float";

const IDS = HOME_CHAPTERS;
const DRIVERS = {
  drift: { page: "wierzbicki", image: "team/kuba-car", face: "team/kuba-face", tilt: -3 },
  formula: { page: "moreau", image: "team/elena-formula", face: "team/elena-face", tilt: 2.5 },
  moto: { page: "aranda", image: "team/tomas-moto", face: "team/tomas-face", tilt: -2 },
} as const;
/** A stop shows from this far before its middle to this far after it (chapters). */
const STOP_WINDOW = [-0.2, 0.22] as const;
/** Share of the viewport height scrolled while the hero wordmark flies into the bar. */
const DOCK_SCROLL = 0.4;
/** How far the floating products follow the cursor (px at full size). */
const CURSOR_PARALLAX = 14;
/**
 * Riding stop to stop: one ride takes `ms` (plus `extra` for each further stop), a wheel gesture
 * counts past `wheel` px, a swipe past `swipe` px, and the wheel stays locked until its events pause
 * for `quiet` ms (a trackpad's inertia) unless a fresh flick starts.
 */
const NAV = { ms: 1400, extra: 250, maxMs: 2400, wheel: 30, swipe: 50, quiet: 160 } as const;
const KEYS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 };

/** Linear RGB → #rrggbb (sRGB). */
function toHex(c: readonly number[]) {
  const channel = (v: number) => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${c.map(channel).join("")}`;
}

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Ride progress at which the camera has covered distance d (the timeline only ever moves forward). */
function progressAtDistance(d: number) {
  const { timeline } = getRide();
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (timeline.distanceAt(mid) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const editable = (node: EventTarget | null) =>
  node instanceof HTMLElement && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName));

/** Stop shown at progress p, or -1 between them. */
function stopAt(p: number) {
  const { timeline } = getRide();
  return timeline.stopCentres.findIndex((c) => {
    const q = (p - c) * timeline.chapters;
    return q >= STOP_WINDOW[0] && q <= STOP_WINDOW[1];
  });
}

/**
 * The home page: the dust ride behind everything, the hero wordmark that flies into the bar, what
 * each chapter shows at its stop, the floating store products and the chapter index.
 * Everything that follows the scroll or the scene is written straight into the DOM from one
 * animation frame loop (Lenis, scene, stops, bar), so riding never re-renders React.
 *
 * The ride goes stop by stop: a wheel gesture, a swipe, the arrow and page keys or the next-stop link
 * ride the camera to the next (or previous) stop, easing over the distance; the progress bar along
 * the bottom, the chapter list in the bar and the keys 1–5 ride to any stop.
 * Past 05 the page scrolls on into the footer as usual; from the top of the footer it rides back.
 */
export function HomeRide({ lang, t }: { lang: Locale; t: Messages["home"] }) {
  const { timeline } = getRide();
  const scene = useRef<DustSceneHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const ride = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  /** Rides to a place on the ride (0 = the opening view, 1… = the stops); set up by the effect. */
  const goTo = useRef<(index: number) => void>(() => {});
  const step = useRef<(direction: number) => void>(() => {});
  const lenis = useRef<Lenis | null>(null);
  const span = useRef({ top: 0, length: 1 });
  const reduced = useRef(false);
  /** Latest frame from the scene, applied on the next animation frame. */
  const frame = useRef<SceneFrame | null>(null);

  useEffect(() => {
    const el = ride.current;
    const home = root.current;
    if (!el || !home) return;
    const docEl = document.documentElement;
    const { timeline } = getRide();
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stops = IDS.map((id) => home.querySelector<HTMLElement>(`[data-stop="${id}"]`));
    const products = Array.from(home.querySelectorAll<HTMLElement>("[data-product]"));
    const fills = Array.from(home.querySelectorAll<HTMLElement>("[data-fill]"));
    const filled = fills.map(() => -1);
    const masks = products.map((_, i) => document.querySelector(`#dissolve-${i} feFuncA`));
    let flight = { dx: 0, dy: 0, s: 1 };
    let viewport = { w: 1, h: 1 };

    // Prints and products load and decode while the intro plays, so no stop waits for a picture.
    home.querySelectorAll<HTMLImageElement>("img[data-preload]").forEach((img) => {
      img.loading = "eager";
      img.decode().catch(() => {});
    });

    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      span.current = { top, length: Math.max(1, el.offsetHeight - window.innerHeight) };
      viewport = { w: docEl.clientWidth, h: docEl.clientHeight };
      // Flight of the hero wordmark into the bar's (measured with the flight transform cleared).
      const big = mark.current;
      const small = document.querySelector("[data-bar-wordmark]");
      if (big && small) {
        big.style.transform = "";
        const from = big.getBoundingClientRect();
        const to = small.getBoundingClientRect();
        flight = { dx: to.left - from.left, dy: to.top - from.top, s: to.width / Math.max(1, from.width) };
      }
    };

    // What is on screen now, so the DOM is only touched when something changes.
    const shown = { stop: -2, chapter: -1, accent: "", docked: false, past: false, dock: -1, next: -2 };

    /** Scroll positions to ride to: the opening view, then the middle of each stop. */
    const places = () => [0, ...timeline.stopCentres.map((c) => span.current.top + c * span.current.length)];
    const live = () => places()[IDS.length];
    /** Scroll position at which the footer's top edge reaches the top of the screen. */
    const footer = () => span.current.top + span.current.length + window.innerHeight;
    /** Next place after (or the last one before) y. */
    const placeFrom = (y: number, direction: number) => {
      const all = places();
      return direction > 0 ? all.findIndex((at) => at > y + 4) : all.findLastIndex((at) => at < y - 4);
    };
    /** Whether a gesture this way is a ride: down until 05, up while the footer's top is in view. */
    const rides = (direction: number, y: number) => (direction > 0 ? y < live() - 2 : y > 2 && y <= footer() - 2);
    const flag = (node: HTMLElement | null, name: string, on: boolean) => node?.toggleAttribute(name, on);

    const applyScroll = () => {
      const ridePast = window.scrollY - span.current.top;
      const p = clamp(ridePast / span.current.length, 0, 1);
      scene.current?.setProgress(p);
      const r = getRide();

      const chapter = chapterAt(r, p);
      if (chapter !== shown.chapter) {
        shown.chapter = chapter;
        updateDashboard({ chapter });
      }

      // Progress bar: each segment fills over the ride into its stop.
      fills.forEach((fill, i) => {
        const from = i === 0 ? 0 : timeline.stopCentres[i - 1];
        const share = Math.round(clamp((p - from) / (timeline.stopCentres[i] - from), 0, 1) * 1000) / 1000;
        if (filled[i] === share) return;
        filled[i] = share;
        fill.style.transform = `scaleX(${share})`;
      });

      const past = ridePast > span.current.length + 8;
      if (past !== shown.past) {
        shown.past = past;
        flag(home, "data-past", past);
      }
      const stop = past ? -1 : stopAt(p);
      if (stop !== shown.stop) {
        shown.stop = stop;
        stops.forEach((node, i) => {
          if (!node) return;
          flag(node, "data-on", i === stop);
          node.inert = i !== stop;
        });
      }

      // Next stop, as the link along the bottom says it (gone from 05 on).
      const coming = window.scrollY < live() - 2 ? placeFrom(window.scrollY, 1) : -1;
      if (coming !== shown.next && next.current) {
        shown.next = coming;
        next.current.hidden = coming < 1;
        next.current.querySelectorAll<HTMLElement>("[data-next]").forEach((label) => {
          label.hidden = Number(label.dataset.next) !== coming - 1;
        });
      }

      const accent = toHex(chapterColour(r, p));
      if (accent !== shown.accent) {
        shown.accent = accent;
        docEl.style.setProperty("--accent", accent);
      }

      // The hero wordmark flies into the bar over the first part of the scroll.
      const big = mark.current;
      const k = clamp(window.scrollY / (DOCK_SCROLL * window.innerHeight), 0, 1);
      if (big && k !== shown.dock && !reduced.current) {
        const e = easeInOut(k);
        big.style.transform = `translate3d(${flight.dx * e}px, ${flight.dy * e}px, 0) scale(${1 + (flight.s - 1) * e})`;
      }
      shown.dock = k;
      // Under reduced motion it does not fly: the big wordmark fades out and the bar's fades in.
      const docked = reduced.current ? k > 0.3 : k >= 1;
      if (docked !== shown.docked) {
        shown.docked = docked;
        flag(big, "data-docked", docked);
        flag(home, "data-docked", docked);
      }
    };

    // Cursor for the products' parallax, -1..1 across the window.
    const cursor = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      cursor.x = (e.clientX / viewport.w) * 2 - 1;
      cursor.y = (e.clientY / viewport.h) * 2 - 1;
    };

    const productForm = products.map(() => 0);
    const applyFrame = (data: SceneFrame) => {
      updateDashboard({ kmh: Math.min(TOP_KMH, (data[0] / sceneTuning.camera.topSpeed) * TOP_KMH) });
      const count = data[1] || 0;
      products.forEach((node, i) => {
        const o = 2 + i * 4;
        const form = i < count ? data[o + 3] : 0;
        if (form <= 0.001) {
          if (productForm[i] > 0) node.style.visibility = "hidden";
          productForm[i] = 0;
          return;
        }
        const size = data[o + 2];
        const shift = reduced.current ? 0 : CURSOR_PARALLAX * size;
        const x = ((data[o] + 1) / 2) * viewport.w + cursor.x * shift;
        const y = ((1 - data[o + 1]) / 2) * viewport.h + cursor.y * shift;
        node.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${size})`;
        node.style.zIndex = String(Math.round(size * 100));
        if (productForm[i] === form) return;
        if (productForm[i] <= 0) node.style.visibility = "visible";
        productForm[i] = form;
        // Comes out of the dust through the noise mask; once whole it drops the filter.
        if (form >= 0.999) node.style.filter = "none";
        else {
          masks[i]?.setAttribute("intercept", String(dissolveIntercept(form)));
          node.style.filter = `url(#dissolve-${i})`;
        }
      });
    };

    // Riding from place to place. While a ride runs (and while a wheel's inertia dies down) further
    // gestures are swallowed.
    const nav = { riding: false, quietUntil: 0, lastWheel: 0, lastSize: 0, sum: 0, touch: null as null | { x: number; y: number } };
    const arrive = (index: number) => {
      nav.riding = false;
      nav.quietUntil = performance.now() + NAV.quiet;
      const url = `${location.pathname}${location.search}${index > 0 ? `#${IDS[index - 1]}` : ""}`;
      history.replaceState(history.state, "", url);
    };
    const rideTo = (index: number) => {
      const all = places();
      const to = all[clamp(index, 0, all.length - 1)];
      const from = window.scrollY;
      if (Math.abs(to - from) < 1) return;
      nav.riding = true;
      if (!smooth) {
        // Reduced motion: a short fade through the background instead of the ride.
        const fade = veil.current;
        if (fade) fade.style.opacity = "1";
        window.setTimeout(() => {
          window.scrollTo({ top: to, behavior: "instant" });
          if (fade) fade.style.opacity = "0";
          window.setTimeout(() => arrive(index), 200);
        }, 200);
        return;
      }
      // Ease over the camera's distance rather than the page: the camera speeds up and brakes evenly
      // whatever the timeline does in between. Off the ride (the opening view above it, the footer
      // below) the page itself eases.
      const { top, length } = span.current;
      const onRide = (y: number) => y >= top && y <= top + length;
      const d0 = timeline.distanceAt(clamp((from - top) / length, 0, 1));
      const d1 = timeline.distanceAt(clamp((to - top) / length, 0, 1));
      const scrollAt = (d: number) => top + progressAtDistance(d) * length;
      const along =
        onRide(from) && onRide(to)
          ? (k: number) => (scrollAt(d0 + (d1 - d0) * easeInOut(k)) - from) / (to - from)
          : easeInOut;
      // Longer rides take a little longer; the nearest place counts as where the ride starts.
      const start = all.reduce((best, at, i) => (Math.abs(at - from) < Math.abs(all[best] - from) ? i : best), 0);
      const ms = Math.min(NAV.maxMs, NAV.ms + NAV.extra * Math.max(0, Math.abs(index - start) - 1));
      smooth.scrollTo(to, {
        duration: ms / 1000,
        easing: (k) => (k >= 1 ? 1 : along(k)),
        lock: true,
        force: true,
        onComplete: () => arrive(index),
      });
    };
    const go = (direction: number) => {
      const index = placeFrom(window.scrollY, direction);
      if (index >= 0) rideTo(index);
    };
    goTo.current = rideTo;
    const releaseRide = setRideHandler((stop) => rideTo(stop + 1));
    step.current = (direction) => {
      if (!nav.riding) go(direction);
    };

    /** A wheel event: true when it belongs to the ride (and is swallowed). */
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      const gap = now - nav.lastWheel;
      nav.lastWheel = now;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (!dy || e.ctrlKey) return false;
      const size = Math.abs(dy);
      // A flick much stronger than the event before it starts a new gesture even mid-inertia.
      const fresh = size > nav.lastSize * 1.8 + 6 && size > 24;
      nav.lastSize = size;
      const direction = Math.sign(dy);
      const y = window.scrollY;
      if (nav.riding || (now < nav.quietUntil && !fresh)) {
        if (gap < NAV.quiet) nav.quietUntil = Math.max(nav.quietUntil, now + NAV.quiet);
        if (y > footer() - 2) return false;
        if (e.cancelable) e.preventDefault();
        return true;
      }
      if (!rides(direction, y)) return false;
      if (e.cancelable) e.preventDefault();
      if (gap > NAV.quiet || Math.sign(nav.sum) !== direction) nav.sum = 0;
      nav.sum += dy;
      if (Math.abs(nav.sum) < NAV.wheel) return true;
      nav.sum = 0;
      go(direction);
      return true;
    };
    const touchDirection = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!nav.touch || !t) return { direction: 0, size: 0 };
      const dx = nav.touch.x - t.clientX;
      const dy = nav.touch.y - t.clientY;
      const along = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      return { direction: Math.sign(along), size: Math.abs(along) };
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      nav.touch = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const { direction } = touchDirection(e);
      if (direction && (nav.riding || rides(direction, window.scrollY)) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const { direction, size } = touchDirection(e);
      nav.touch = null;
      if (!nav.riding && size > NAV.swipe && rides(direction, window.scrollY)) go(direction);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || editable(e.target)) return;
      // 1–5 ride straight to that stop.
      const stop = /^[1-9]$/.test(e.key) ? Number(e.key) : 0;
      if (stop >= 1 && stop <= IDS.length) {
        e.preventDefault();
        rideTo(stop);
        return;
      }
      const direction = KEYS[e.key];
      if (!direction) return;
      if (!rides(direction, window.scrollY)) return;
      e.preventDefault();
      if (!nav.riding) go(direction);
    };

    // Smooth scrolling on desktop (touch scrolls natively) for the footer and the rides, driven from
    // this one loop; ride gestures never reach it.
    const smooth = reduced.current
      ? null
      : new Lenis({
          autoRaf: false,
          syncTouch: false,
          ...sceneTuning.scroll.lenis,
          virtualScroll: ({ event }) => !(event instanceof WheelEvent && onWheel(event)),
        });
    lenis.current = smooth;
    const onPlainWheel = (e: WheelEvent) => {
      onWheel(e);
    };
    if (!smooth) window.addEventListener("wheel", onPlainWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    let scrolled = true;
    const onScroll = () => {
      scrolled = true;
    };
    let raf = 0;
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      smooth?.raf(time);
      if (scrolled) {
        scrolled = false;
        applyScroll();
      }
      const data = frame.current;
      if (data) {
        frame.current = null;
        applyFrame(data);
      }
    };
    smooth?.on("scroll", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    const onResize = () => {
      measure();
      shown.dock = -1;
      scrolled = true;
    };
    window.addEventListener("resize", onResize);
    measure();
    // Arriving with a stop in the address (/#moto) starts the ride at that stop.
    const arrival = IDS.indexOf(location.hash.slice(1) as (typeof IDS)[number]);
    if (arrival >= 0) {
      const at = places()[arrival + 1];
      window.scrollTo({ top: at, behavior: "instant" });
      smooth?.scrollTo(at, { immediate: true, force: true });
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      releaseRide();
      smooth?.destroy();
      lenis.current = null;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onPlainWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      docEl.style.removeProperty("--accent");
      resetDashboard();
    };
  }, []);

  const names = t.chapterNames;
  const chapters = IDS.map((id, i) => ({ id, number: String(i + 1).padStart(2, "0"), name: names[i] }));

  return (
    <div ref={root} className="home group/home relative" style={{ "--intro-delay": `${INTRO_DELAY}ms` } as CSSProperties}>
      <DustCanvas
        ref={scene}
        warmup={INTRO_DELAY + intro.out}
        onFrame={(data) => {
          frame.current = data;
        }}
        poster={
          <Picture
            image="vehicles/drift-car"
            alt=""
            sizes="100vw"
            loading="eager"
            className="absolute inset-0 size-full object-cover opacity-40"
          />
        }
      />

      {/* Hero wordmark: full width under the bar, flies into the bar's place as the ride starts. */}
      <div
        ref={mark}
        data-hero-mark
        aria-hidden
        className="pointer-events-none fixed inset-x-4 top-[calc(3rem+1rem)] z-50 origin-top-left text-accent transition-opacity duration-(--dur-fade) data-docked:opacity-0 sm:inset-x-6"
      >
        <div className="hero-enter">
          <Wordmark decorative className="w-full max-w-full" />
        </div>
      </div>

      <div
        ref={ride}
        className="relative z-10 h-(--ride) max-md:h-(--ride-phone)"
        style={
          {
            "--ride": `${timeline.chapters * sceneTuning.scroll.chapter.desktop}svh`,
            "--ride-phone": `${timeline.chapters * sceneTuning.scroll.chapter.mobile}svh`,
          } as CSSProperties
        }
      >
        <section className="px-4 pt-4 sm:px-6">
          <div aria-hidden style={{ aspectRatio: "489.1 / 100" }} />
          <h1 className="mt-6 max-w-3xl text-3xl leading-[1.08] font-medium tracking-tight break-words sm:mt-10 sm:text-5xl lg:text-6xl">
            {t.heading.map((line, i) => (
              <span key={line} className="hero-enter block" style={{ "--i": i + 1 } as CSSProperties}>
                {line}
              </span>
            ))}
          </h1>
          <p className="hero-enter mt-4 text-base text-muted sm:text-lg" style={{ "--i": 3 } as CSSProperties}>
            {t.sub}
          </p>
        </section>

        {/* Anchors at the middle of each stop, for links such as /#live. */}
        {IDS.map((id, i) => (
          <span
            key={id}
            id={id}
            aria-hidden
            className="absolute left-0 h-px w-px"
            style={{ top: `calc(${timeline.stopCentres[i]} * (100% - 100svh))` }}
          />
        ))}
      </div>

      <StoreFloat lang={lang} t={t.products} />

      {(["drift", "formula", "moto"] as const).map((id, i) => {
        const c = t.chapters[id];
        const d = DRIVERS[id];
        return (
          <ChapterStop
            key={id}
            id={id}
            label={`${chapters[i].number} — ${names[i]}`}
            number={c.number}
            name={c.name}
            data={c.data}
            line={c.line}
            link={{ href: `/${lang}/team/${d.page}`, label: c.link }}
            print={{ image: d.image, face: d.face, alt: c.photo, faceAlt: c.face, tilt: d.tilt }}
          />
        );
      })}
      <ChapterStop
        id="store"
        label={`${chapters[3].number} — ${names[3]}`}
        number={t.chapters.store.number}
        name={t.chapters.store.name}
        data={t.chapters.store.data}
        line={t.chapters.store.line}
        link={{ href: `/${lang}/store`, label: t.chapters.store.link }}
      />
      <ChapterStop
        id="live"
        label={`${chapters[4].number} — ${names[4]}`}
        number={t.live.number}
        name={t.live.name}
        aside={<LiveRounds lang={lang} t={t.live} />}
      >
        <LiveCountdown t={t.live} />
      </ChapterStop>

      {/* Next stop: a link along the bottom on desktop, arrows at the bottom edge on phones. */}
      <div className="transition-opacity duration-(--dur-base) ease-standard group-data-past/home:pointer-events-none group-data-past/home:opacity-0">
        <button
          ref={next}
          type="button"
          onClick={() => step.current(1)}
          className="hero-enter label fixed bottom-8 left-1/2 z-30 -translate-x-1/2 text-[11px] text-fg underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-current max-md:hidden"
        >
          {t.nextStop} ·{" "}
          {chapters.map((c, i) => (
            <span key={c.id} data-next={i} hidden={i > 0}>
              {`${c.number} ${c.name}`}
            </span>
          ))}{" "}
          →
        </button>
        <div className="fixed inset-x-4 bottom-8 z-30 flex justify-between md:hidden">
          <button
            type="button"
            aria-label={t.prevStop}
            onClick={() => step.current(-1)}
            className="panel label grid size-11 place-items-center text-sm text-fg"
          >
            ←
          </button>
          <button
            type="button"
            aria-label={t.nextStop}
            onClick={() => step.current(1)}
            className="panel label grid size-11 place-items-center text-sm text-fg"
          >
            →
          </button>
        </div>
      </div>

      {/* Reduced motion: rides become a short fade through the background. */}
      <div
        ref={veil}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 bg-bg opacity-0 transition-opacity duration-(--dur-fade) ease-standard"
      />

      {/*
        Progress along the bottom, one segment per stop: thin to look at, 24 px to hit. Hover or focus
        names the stop above its segment; a click rides there.
      */}
      <nav
        aria-label={t.chaptersLabel}
        className="hero-enter fixed inset-x-0 bottom-0 z-30 flex gap-1 px-4 transition-opacity duration-(--dur-base) ease-standard group-data-past/home:pointer-events-none group-data-past/home:opacity-0 sm:px-6"
      >
        {chapters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            aria-label={`${c.number} ${c.name}`}
            onClick={() => goTo.current(i + 1)}
            className="group relative h-6 flex-1"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 overflow-hidden bg-fg/15 transition-[height] duration-(--dur-fast) ease-standard group-hover:h-1 group-focus-visible:h-1"
            >
              <span data-fill className="absolute inset-0 origin-left scale-x-0 bg-accent" />
            </span>
            <span
              aria-hidden
              className="label pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 translate-y-1 text-[11px] whitespace-nowrap text-fg opacity-0 transition-[opacity,translate] duration-(--dur-fast) ease-standard group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
            >
              {c.number} {c.name}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
