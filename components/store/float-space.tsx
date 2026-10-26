"use client";

import Link from "next/link";
import { type MouseEvent, useEffect, useRef } from "react";
import { dissolveIntercept } from "@/components/home/store-float";
import { Picture } from "@/components/ui/picture";
import type { FloatItem } from "@/content/store";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { images } from "@/lib/images";
import { clamp, random } from "@/lib/scene/math";
import { FIELD, FIELD_SCREENS, fieldCounts, fieldLayout, fieldWidth, LAYERS } from "@/lib/store-float";
import type { Messages } from "@/messages";

type StoreText = Messages["store"];

/** Coming out of the dust and going back into it (ms), each product within its own delay. */
const FORM = { in: 520, out: 380, spread: 220 };
/** The slow drift: reach (px), period range (s), turn (deg). */
const DRIFT = { px: 8, slow: 10, fast: 6, turn: 4 };
/** How long the others take to drift off before the picked one carries over (ms). */
export const PICK_MS = 260;
export const LEAVE_MS = FORM.out + FORM.spread;

/**
 * The store as a long field of small cut-outs over the dust, lots of air between them: blue noise
 * across the whole width, three layers sliding past each other with the scroll (0.7×, 1×, 1.3×,
 * the farther ones smaller), each product drifting and turning a little. The set repeats down
 * the field to keep it equally full. A product comes out of the dust grain by grain (noise mask)
 * when the set mounts and goes back into it while `leaving`. Hover enlarges one with its name and
 * price beside it and turns the cursor into VIEW; a click sends the rest away and opens it.
 */
export function FloatSpace({
  lang,
  t,
  items,
  phone,
  leaving,
  onOpen,
}: {
  lang: Locale;
  t: StoreText;
  items: FloatItem[];
  phone: boolean;
  leaving: boolean;
  onOpen: (href: string, picture: HTMLElement | null) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  /** When the set started going back into the dust (0 while it stays). */
  const leftAt = useRef(0);
  const count = fieldCounts((phone ? FIELD.phone : FIELD.desktop).perScreen).reduce((a, b) => a + b, 0);
  const field = items.length ? Array.from({ length: count }, (_, i) => items[i % items.length]) : [];

  useEffect(() => {
    leftAt.current = leaving ? performance.now() : 0;
  }, [leaving]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-float]"));
    const masks = nodes.map((_, i) => el.querySelector(`#float-dissolve-${i} feFuncA`));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rand = random(nodes.length * 7 + 3);
    const own = nodes.map(() => ({
      phase: rand() * Math.PI * 2,
      period: DRIFT.fast + rand() * (DRIFT.slow - DRIFT.fast),
      delay: rand() * FORM.spread,
      form: 0,
      x: 0,
      y: 0,
      h: 0,
      speed: 1,
    }));

    const measure = () => {
      const width = el.clientWidth;
      const screen = el.clientHeight / FIELD_SCREENS;
      const points = fieldLayout(width / Math.max(1, screen), phone ? FIELD.phone : FIELD.desktop);
      nodes.forEach((node, i) => {
        const point = points[i];
        const item = items[i % items.length];
        if (!point || !item) return;
        const shot = images[item.shot];
        const layer = LAYERS[point.layer];
        const w = (fieldWidth(item.product.float, phone) * layer.size * width) / 100;
        const h = (w * shot.height) / shot.width;
        node.style.width = `${w.toFixed(1)}px`;
        node.style.zIndex = String(point.layer + 1);
        node.dataset.side = point.x > 0.7 ? "left" : "right";
        Object.assign(own[i], { x: point.x * width - w / 2, y: point.y * screen - h / 2, h, speed: layer.speed });
      });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);

    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const still = motion.matches;
      const top = el.getBoundingClientRect().top;
      const scrolled = -top;
      const view = window.innerHeight;
      const time = still ? 0 : (now - start) / 1000;
      const gone = leftAt.current;

      nodes.forEach((node, i) => {
        const m = own[i];
        const y = m.y + (still ? 0 : (1 - m.speed) * scrolled);
        const onScreen = top + y < view + 40 && top + y + m.h > -40;
        if (!onScreen) {
          if (node.style.visibility !== "hidden") node.style.visibility = "hidden";
          return;
        }
        if (still) m.form = gone ? 0 : 1;
        else if (gone) m.form = Math.min(m.form, 1 - clamp((now - gone - m.delay) / FORM.out, 0, 1));
        else m.form = clamp((now - start - m.delay) / FORM.in, 0, 1);

        const swing = (time / m.period) * Math.PI * 2 + m.phase;
        const dx = Math.sin(swing) * DRIFT.px;
        const dy = Math.cos(swing * 0.8) * DRIFT.px;
        const turn = Math.sin(swing * 0.6 + 1) * DRIFT.turn;
        node.style.transform = `translate3d(${(m.x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px, 0) rotate(${turn.toFixed(2)}deg)`;
        node.style.visibility = m.form > 0 ? "visible" : "hidden";
        if (m.form < 1 && !still) {
          masks[i]?.setAttribute("intercept", String(dissolveIntercept(m.form)));
          node.style.filter = `url(#float-dissolve-${i})`;
        } else if (node.style.filter) {
          node.style.filter = "";
        }
      });
    };
    raf = requestAnimationFrame(frame);

    const label = cursor.current;
    const follow = (e: PointerEvent) => {
      if (label) label.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    };
    el.addEventListener("pointermove", follow, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      el.removeEventListener("pointermove", follow);
    };
  }, [items, phone]);

  const open = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const node = event.currentTarget;
    node.dataset.picked = "";
    stage.current?.setAttribute("data-leaving", "");
    cursor.current?.removeAttribute("data-on");
    window.setTimeout(() => onOpen(href, node.querySelector("img")), PICK_MS);
  };

  return (
    <div ref={stage} className="float-stage absolute inset-0 overflow-hidden">
      <svg aria-hidden width="0" height="0" className="absolute">
        {field.map((_, i) => (
          <filter key={i} id={`float-dissolve-${i}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed={i + 5} result="noise" />
            <feComponentTransfer in="noise" result="mask">
              <feFuncA type="linear" slope="8" intercept={dissolveIntercept(0)} />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="mask" operator="in" />
          </filter>
        ))}
      </svg>
      {field.map((item, i) => {
        const { product, option } = item;
        const name = t.products[product.slug as keyof StoreText["products"]].name;
        const flavour = option && product.options?.kind === "flavour" ? t.flavours[option.value as keyof StoreText["flavours"]] : "";
        const href = `/${lang}/store/${product.slug}${flavour ? `#${option?.value}` : ""}`;
        return (
          <Link
            key={i}
            href={href}
            tabIndex={-1}
            data-float
            onClick={(event) => open(event, href)}
            onPointerEnter={() => cursor.current?.setAttribute("data-on", "")}
            onPointerLeave={() => cursor.current?.removeAttribute("data-on")}
            className="float-item group absolute top-0 left-0 block cursor-none will-change-transform"
            style={{ visibility: "hidden" }}
          >
            <Picture
              image={item.shot}
              alt={`${name}${flavour ? ` ${flavour}` : ""}`}
              sizes={phone ? "26vw" : "12vw"}
              className="float-pic block h-auto w-full"
            />
            <span aria-hidden className="float-tag label pointer-events-none absolute top-1/2 text-[11px] whitespace-nowrap text-fg">
              {name}
              {flavour ? ` ${flavour}` : ""} · {formatPrice(product.priceCents, lang)}
            </span>
          </Link>
        );
      })}
      <span
        ref={cursor}
        aria-hidden
        className="float-cursor label pointer-events-none fixed top-0 left-0 z-50 text-[11px] text-bg"
      >
        <span className="block bg-fg px-2 py-1">{t.cursor}</span>
      </span>
    </div>
  );
}
