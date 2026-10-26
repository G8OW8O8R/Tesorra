"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { Picture } from "@/components/ui/picture";
import type { ImageKey } from "@/lib/images";

/**
 * The hand: degrees between neighbouring cards when spread (phone / desktop), each card's tilt
 * while the deck is still stacked, the drag distance that deals one card (share of a card's
 * width) and the time constant cards settle with after a drag or a key (s).
 */
const FAN = { angle: { phone: 6, desktop: 11 }, rest: [-4, 2.5, -1.5, 3.5, -2.5], deal: 0.6, settle: 0.12 };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Paddock photos held like a hand of cards. Scrolling through the section spreads the stacked deck
 * into a fan; dragging sideways (or ← →) deals the cards round, the front one in the middle; a click
 * on a side card brings it to the front; hover lifts a card. Cards past the edge of the hand fade
 * out on one side and in on the other. Transforms are written straight to the DOM.
 */
export function PaddockFan({
  images,
  captions,
  label,
  help,
}: {
  images: ImageKey[];
  captions: Record<string, string>;
  label: string;
  help: string;
}) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  /** Which card is in front, as a continuous index, and where it is heading. */
  const deal = useRef({ value: 0, target: 0, still: false });

  useEffect(() => {
    const root = section.current;
    const el = stage.current;
    if (!root || !el) return;
    const n = images.length;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = performance.now();
    const drag = { id: -1, x: 0, from: 0, moved: false };

    const wrap = (slot: number) => ((((slot + n / 2) % n) + n) % n) - n / 2;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const still = motion.matches;
      deal.current.still = still;
      const r = root.getBoundingClientRect();
      const travel = Math.max(1, r.height - window.innerHeight);
      const spread = still ? 1 : easeInOut(Math.min(1, Math.max(0, -r.top / (travel * 0.6))));
      const d = deal.current;
      if (drag.id < 0) {
        d.value = still ? d.target : d.value + (d.target - d.value) * (1 - Math.exp(-dt / FAN.settle));
        if (Math.abs(d.target - d.value) < 1e-3) d.value = d.target;
      }
      const step = window.innerWidth < 768 ? FAN.angle.phone : FAN.angle.desktop;
      cards.current.forEach((card, i) => {
        if (!card) return;
        const slot = wrap(i - d.value);
        const far = Math.abs(slot);
        const angle = slot * step * spread + FAN.rest[i % FAN.rest.length] * (1 - spread);
        card.style.transform = `rotate(${angle.toFixed(3)}deg)`;
        card.style.opacity = String(1 - smoothstep(n / 2 - 0.6, n / 2, far));
        card.style.zIndex = String(100 - Math.round(far * 10));
        card.toggleAttribute("data-front", far < 0.5);
      });
    };

    // Runs only while the section is on screen.
    const io = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf);
      if (entry.isIntersecting) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(root);

    const cardWidth = () => cards.current[0]?.offsetWidth ?? 200;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.from = deal.current.value;
      drag.moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        el.setPointerCapture(e.pointerId);
      }
      if (drag.moved) deal.current.value = drag.from - dx / (cardWidth() * FAN.deal);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      drag.id = -1;
      const d = deal.current;
      if (drag.moved) {
        d.target = Math.round(d.value);
        return;
      }
      // A click on a card deals it to the front.
      const card = (e.target as Element).closest<HTMLElement>("[data-card]");
      const i = card ? cards.current.indexOf(card) : -1;
      if (i >= 0) d.target = Math.round(d.value + wrap(i - d.value));
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [images.length]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const d = deal.current;
    d.target = Math.round(d.target) + (e.key === "ArrowRight" ? 1 : -1);
    if (d.still) d.value = d.target;
  };

  return (
    <section ref={section} aria-labelledby="paddock" className="relative z-10 h-[200svh] md:h-[240svh]">
      <div className="sticky top-(--bar-h) flex h-[calc(100svh-var(--bar-h))] flex-col overflow-hidden px-(--gutter) pt-8 pb-[calc(var(--dock-h)+32px)]">
        <h2 id="paddock" className="label text-[11px] text-muted">
          {label}
        </h2>
        <p id="paddock-help" className="sr-only">
          {help}
        </p>
        <div
          ref={stage}
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-labelledby="paddock"
          aria-describedby="paddock-help"
          onKeyDown={onKey}
          className="relative mt-6 flex-1 cursor-grab touch-pan-y select-none [--card-w:min(46vw,30svh)] active:cursor-grabbing md:[--card-w:min(18vw,34svh)]"
        >
          {images.map((image, i) => (
            <figure
              key={image}
              data-card
              ref={(node) => {
                cards.current[i] = node;
              }}
              className="fan-card group"
              style={{ transform: `rotate(${FAN.rest[i % FAN.rest.length]}deg)`, zIndex: 100 - i } as CSSProperties}
            >
              <div className="fan-lift border border-line bg-bg p-1.5 shadow-[0_24px_60px_rgb(0_0_0/0.55)] transition-colors duration-(--dur-base) group-data-[front]:border-fg/25">
                <Picture
                  image={image}
                  alt={captions[image] ?? ""}
                  sizes="(min-width: 768px) 18vw, 46vw"
                  draggable={false}
                  className="pointer-events-none aspect-[1536/2752] w-full object-cover"
                />
                <figcaption className="label flex items-baseline justify-between gap-2 px-1 pt-2 pb-0.5 text-[10px] text-muted">
                  <span className="truncate">{captions[image]}</span>
                  <span className="shrink-0">
                    {String(i + 1).padStart(2, "0")}/{String(images.length).padStart(2, "0")}
                  </span>
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
