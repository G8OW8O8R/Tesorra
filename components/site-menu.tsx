"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, type MouseEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FLOATING_PRODUCTS } from "@/components/home/store-float";
import { Picture } from "@/components/ui/picture";
import { PitBoard } from "@/components/ui/pit-board";
import { type Round, roundDayMonth, roundStart, season, upcomingRounds } from "@/content/season";
import { team } from "@/content/team";
import { writeDigits } from "@/lib/flip-digits";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { LanguageSwitch } from "./language-switch";
import { isTyping } from "./nav-shortcuts";
import { type HomeStop, useRideHome } from "./use-ride-home";

/** Texts the menu borrows from other parts of the site. */
export type MenuText = {
  live: Messages["home"]["live"];
  /** Product names by slug. */
  names: Record<string, string>;
  footer: Messages["footer"];
};

type Entry = { label: string; href: string; stop?: HomeStop };
type Item = Entry & { key: "team" | "store" | "live"; shortcut: string; subs: Entry[] };

const noop = () => () => {};
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Under this (or without hover) a word's first tap opens its sub-links instead of following it. */
const TAP = "(max-width: 47.99rem), (hover: none)";
const SHORTCUTS = ["t", "s", "l"];
const UNITS = ["days", "hours", "minutes", "seconds"] as const;
const STORE_SECTIONS = [
  ["drink", "drink"],
  ["helmets", "helmets"],
  ["gear", "drift-gear"],
  ["apparel", "apparel"],
] as const;
/** The product the menu's card shows. */
const PICK = FLOATING_PRODUCTS[0];

/** A word whose letters flip up like timing-board flaps, one after another, on hover or focus. */
function FlapWord({ text }: { text: string }) {
  return (
    <span aria-hidden className="flex">
      {Array.from(text).map((ch, i) => (
        <span key={i} className="flap-l">
          <span data-ch={ch} style={{ "--i": i } as CSSProperties}>
            {ch}
          </span>
        </span>
      ))}
    </span>
  );
}

/** D H M S to the round's start, written straight into its own cells each second while shown. */
function RoundCountdown({
  round,
  units,
  running,
  className = "text-xl",
}: {
  round: Round;
  units: MenuText["live"]["units"];
  running: boolean;
  className?: string;
}) {
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !running) return;
    const cells = UNITS.map((unit) => el.querySelector<HTMLElement>(`[data-unit="${unit}"]`));
    const start = roundStart(round).getTime();
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.floor((start - now) / 1000));
      const values = [Math.floor(left / 86400), Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60];
      values.forEach((v, i) => writeDigits(cells[i], String(v).padStart(2, "0")));
      timer = window.setTimeout(tick, 1000 - (now % 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [round, running]);

  return (
    <span ref={root} aria-hidden className={`label flex items-baseline gap-x-[0.5em] leading-none text-fg ${className}`}>
      {UNITS.map((unit) => (
        <span key={unit} className="flex items-baseline gap-[0.15em]">
          <span data-unit={unit} className="tabular-nums">
            --
          </span>
          <span className="text-[0.55em] text-amber">{units[unit]}</span>
        </span>
      ))}
    </span>
  );
}

type Preview = { item: Item["key"]; driver: number } | null;

/** Products afloat in the store preview: where they hang (shares of the window) and how wide. */
const PREVIEW_PRODUCTS = [
  { image: "store/helmet-21", x: 0.12, y: 0.08, w: 0.5 },
  { image: "store/can-citrus", x: 0.66, y: 0.28, w: 0.2 },
  { image: "store/hoodie-front", x: 0.22, y: 0.5, w: 0.54 },
] as const;

/**
 * The menu's right-hand window: where the hovered word leads, cross-fading in 300 ms. A driver
 * with the car or bike (as on the team page), three products afloat, or the next round's venue
 * counting down; the team at night when nothing is hovered.
 */
function MenuPreview({
  preview,
  next,
  units,
  running,
}: {
  preview: Preview;
  next: Round | undefined;
  units: MenuText["live"]["units"];
  running: boolean;
}) {
  const layer = (on: boolean) =>
    `absolute inset-0 transition-opacity duration-300 ease-standard ${on ? "opacity-100" : "opacity-0"}`;
  return (
    <div aria-hidden className="relative h-[min(64svh,44rem)] w-full overflow-hidden border border-line bg-bg">
      <div className={layer(preview === null || (preview.item === "live" && !next))}>
        <Picture image="team/team-night" alt="" sizes="30vw" className="size-full object-cover object-[58%_50%]" />
      </div>
      {team.drivers.map((d, j) => (
        <div key={d.slug} className={layer(preview?.item === "team" && preview.driver === j)}>
          <Picture
            image={d.vehicle}
            alt=""
            sizes="30vw"
            className="size-full object-cover"
            style={{ objectPosition: `${d.vehicleFocus[0] * 100}% ${d.vehicleFocus[1] * 100}%` }}
          />
          <span className="label absolute bottom-3 left-3 text-[11px] text-fg">
            #{d.number} {d.lastName}
          </span>
        </div>
      ))}
      <div className={`${layer(preview?.item === "store")} bg-panel`}>
        {PREVIEW_PRODUCTS.map((p, i) => (
          <span
            key={p.image}
            className="float-drift absolute block"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, "--i": i } as CSSProperties}
          >
            <Picture image={p.image} alt="" sizes="16vw" className="h-auto w-full" />
          </span>
        ))}
      </div>
      {next ? (
        <div className={layer(preview?.item === "live")}>
          <Picture image={next.image} alt="" sizes="30vw" className="size-full object-cover" />
          <span className="absolute inset-0 bg-linear-to-t from-bg/90 via-bg/30 to-bg/0" />
          <span className="absolute inset-x-4 bottom-4 flex flex-col gap-2">
            <span className="headline text-3xl leading-none">{next.city}</span>
            <RoundCountdown round={next} units={units} running={running} className="text-2xl" />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * MENU toggle and the full-screen menu behind it. The sheet drops from the top over the page
 * (under the bar, which keeps the toggle); once it covers it only the dust scene stays beneath.
 * The words rise out of a mask: three huge words, each with its mono sub-links sliding out on
 * hover (a tap on phones), the ride's stops under them; on the left two pit boards (the next round
 * counting down, a product), on the right a window onto the hovered word. Esc closes it and focus
 * stays inside while it is open.
 */
export function SiteMenu({ lang, t, text }: { lang: Locale; t: Messages["nav"]; text: MenuText }) {
  const pathname = usePathname();
  // Remember where the menu was opened; any navigation closes it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  /** When it opened: what counts as the next round. */
  const [openedTime, setOpenedTime] = useState<number | null>(null);
  /** Phones: the word whose sub-links are out. */
  const [expanded, setExpanded] = useState<Item["key"] | null>(null);
  /** What the right-hand window shows: the hovered or focused word (and driver). */
  const [preview, setPreview] = useState<Preview>(null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const toggle = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const rideHome = useRideHome(lang);
  const s = t.sheet;

  useEffect(() => {
    if (!open) return;
    const panel = sheet.current;
    const outside = [document.getElementById("main"), document.getElementById("footer")];
    outside.forEach((el) => el?.setAttribute("inert", ""));
    document.documentElement.style.overflow = "hidden";
    panel?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });

    const focusable = () =>
      [toggle.current, ...(panel?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])].filter(
        (el): el is HTMLElement => !!el && el.getClientRects().length > 0,
      );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpenedAt(null);
        toggle.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        // Round the toggle and the sheet only.
        event.preventDefault();
        const items = focusable();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = at < 0 ? (event.shiftKey ? items.length - 1 : 0) : at + (event.shiftKey ? -1 : 1);
        items[(next + items.length) % items.length]?.focus();
        return;
      }
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target);
      if (plain && SHORTCUTS.includes(event.key.toLowerCase())) {
        // The bar's shortcuts take it from here.
        setOpenedAt(null);
        return;
      }
      // Nothing else reaches the page under the menu (the home ride listens for keys).
      event.stopPropagation();
    };
    // Wheel and touch stay in the sheet, away from the ride under it.
    const keep = (event: Event) => event.stopPropagation();
    window.addEventListener("keydown", onKeyDown, true);
    panel?.addEventListener("wheel", keep, { passive: true });
    panel?.addEventListener("touchstart", keep, { passive: true });
    panel?.addEventListener("touchmove", keep, { passive: true });
    panel?.addEventListener("touchend", keep, { passive: true });
    return () => {
      outside.forEach((el) => el?.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown, true);
      panel?.removeEventListener("wheel", keep);
      panel?.removeEventListener("touchstart", keep);
      panel?.removeEventListener("touchmove", keep);
      panel?.removeEventListener("touchend", keep);
    };
  }, [open]);

  const onToggle = () => {
    if (open) {
      setOpenedAt(null);
      return;
    }
    setOpenedTime(Date.now());
    setExpanded(null);
    setPreview(null);
    setOpenedAt(pathname);
  };

  /** Rides to a home stop, closes on a link to this very page, and lets other links navigate. */
  const follow = (event: MouseEvent, entry: Entry) => {
    if (entry.stop) {
      event.preventDefault();
      setOpenedAt(null);
      rideHome(entry.stop);
      return;
    }
    const [path, hash] = entry.href.split("#");
    if (path !== pathname) return;
    setOpenedAt(null);
    // The router changes only the hash here, without telling the page: tell it.
    if (hash) requestAnimationFrame(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  };

  const onWord = (event: MouseEvent, item: Item) => {
    if (item.subs.length > 0 && expanded !== item.key && matchMedia(TAP).matches) {
      event.preventDefault();
      setExpanded(item.key);
      return;
    }
    follow(event, item);
  };

  const next = upcomingRounds(new Date(openedTime ?? Date.parse(season.rounds[0].start) - 1), 1)[0];
  const live: Entry = { label: s.items.live, href: `/${lang}#live`, stop: "live" };
  const items: Item[] = [
    {
      key: "team",
      label: s.items.team,
      href: `/${lang}/team`,
      shortcut: "T",
      subs: team.drivers.map((d) => ({ label: `#${d.number} ${d.lastName}`, href: `/${lang}/team/${d.slug}` })),
    },
    {
      key: "store",
      label: s.items.store,
      href: `/${lang}/store`,
      shortcut: "S",
      subs: STORE_SECTIONS.map(([key, hash]) => ({ label: s.store[key], href: `/${lang}/store#${hash}` })),
    },
    {
      key: "live",
      ...live,
      shortcut: "L",
      subs: next ? [{ ...live, label: `${roundDayMonth(next, lang)} · ${next.city}` }] : [],
    },
  ];
  const stops = (["drift", "formula", "moto"] as const).map((id, i) => ({
    id,
    label: t.chapters[i],
    href: `/${lang}#${id}`,
  }));
  const footerLinks: Entry[] = [
    { label: text.footer.links.team, href: `/${lang}/team` },
    { label: text.footer.links.store, href: `/${lang}/store` },
    { ...live, label: text.footer.links.live },
    { label: text.footer.credits, href: `/${lang}/credits` },
    { label: text.footer.legal, href: `/${lang}/legal` },
  ];
  const price = formatPrice(PICK.priceCents, lang);
  const productName = text.names[PICK.slug];

  return (
    <>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={onToggle}
        className="label inline-flex h-8 items-center px-2 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
      >
        {open ? t.close : t.menu}
      </button>
      {mounted &&
        createPortal(
          <div
            ref={sheet}
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t.menuLabel}
            inert={!open}
            data-open={open ? "" : undefined}
            data-lenis-prevent
            className="menu-sheet fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-bg/96 backdrop-blur-[16px]"
          >
            <div className="flex min-h-full flex-col px-(--gutter) pt-[calc(var(--bar-h)+2rem)] pb-5 md:pt-[calc(var(--bar-h)+5svh)]">
              <div className="flex flex-1 flex-col gap-10 md:grid md:grid-cols-[minmax(13rem,17rem)_auto] md:items-center md:gap-[4vw] lg:grid-cols-[minmax(13rem,17rem)_auto_minmax(0,1fr)]">
                <nav aria-label={t.menuLabel} className="md:order-2">
                  <ul
                    className="menu-words"
                    onPointerLeave={() => setPreview(null)}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(null);
                    }}
                  >
                    {items.map((item, i) => (
                      <li
                        key={item.key}
                        data-expanded={expanded === item.key ? "" : undefined}
                        className="menu-item md:flex md:items-end md:gap-8"
                        onPointerEnter={() => setPreview({ item: item.key, driver: 0 })}
                      >
                        <div className="flex items-start gap-3">
                          <div className="menu-mask">
                            <div className="menu-rise" style={{ "--i": i } as CSSProperties}>
                              <Link
                                href={item.href}
                                aria-keyshortcuts={item.shortcut}
                                onClick={(event) => onWord(event, item)}
                                onFocus={() => setPreview({ item: item.key, driver: 0 })}
                                className="menu-word headline block text-[16vw] leading-[0.9] text-fg outline-none focus-visible:text-amber md:text-[min(8vw,14svh)]"
                              >
                                <FlapWord text={item.label} />
                                <span className="sr-only">{item.label}</span>
                              </Link>
                            </div>
                          </div>
                          <kbd
                            aria-hidden
                            className="menu-fade label mt-[0.5em] text-[11px] text-muted md:text-xs"
                            style={{ "--i": i } as CSSProperties}
                          >
                            {item.shortcut}
                          </kbd>
                        </div>
                        {item.subs.length > 0 ? (
                          <ul className="menu-subs label flex flex-col gap-1.5 pt-3 pb-4 text-[13px] md:pt-0 md:pb-[0.5em] md:text-sm">
                            {item.subs.map((sub, j) => (
                              <li key={sub.href + sub.label} style={{ "--j": j } as CSSProperties}>
                                <Link
                                  href={sub.href}
                                  onPointerEnter={() => setPreview({ item: item.key, driver: j })}
                                  onFocus={() => setPreview({ item: item.key, driver: j })}
                                  onClick={(event) => follow(event, sub)}
                                  className="text-fg/80 transition-colors duration-(--dur-fast) ease-standard hover:text-amber focus-visible:text-amber"
                                >
                                  {sub.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  <ul
                    aria-label={s.stops}
                    className="menu-fade label mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:mt-8 md:text-base"
                    style={{ "--i": 3 } as CSSProperties}
                  >
                    {stops.map((stop, i) => (
                      <li key={stop.id} className="flex items-center gap-3">
                        {i > 0 ? (
                          <span aria-hidden className="text-muted">
                            ·
                          </span>
                        ) : null}
                        <Link
                          href={stop.href}
                          onClick={(event) => follow(event, { ...stop, stop: stop.id })}
                          className="text-fg/70 transition-colors duration-(--dur-fast) ease-standard hover:text-(color:--c) focus-visible:text-(color:--c)"
                          style={{ "--c": `var(--chapter-${stop.id})` } as CSSProperties}
                        >
                          <span className="text-muted">{String(i + 1).padStart(2, "0")}</span> {stop.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>

                <aside className="flex flex-col gap-3 md:order-1">
                  <div className="menu-fade" style={{ "--i": 1 } as CSSProperties}>
                    <PitBoard
                      interactive
                      title={next ? fill(s.roundTitle, { round: next.round }) : s.round}
                      meta={next ? roundDayMonth(next, lang) : undefined}
                    >
                      {next ? (
                        <Link
                          href={live.href}
                          aria-label={fill(s.roundLink, { round: next.round, city: next.city })}
                          onClick={(event) => follow(event, live)}
                          className="group grid grid-cols-[34%_1fr] gap-3 p-3 outline-none md:grid-cols-1 md:p-4"
                        >
                          <span className="relative block aspect-[16/10] overflow-hidden bg-bg md:aspect-[16/7]">
                            <Picture
                              image={next.image}
                              alt=""
                              sizes="(min-width: 768px) 19rem, 34vw"
                              className="size-full object-cover transition-transform duration-(--dur-slow) ease-out group-hover:scale-[1.04]"
                            />
                          </span>
                          <span className="flex min-w-0 flex-col gap-2">
                            <span className="label text-[11px] text-muted">{s.round}</span>
                            <span className="headline text-xl leading-none break-words md:text-2xl">{next.city}</span>
                            <span className="label text-[11px]" style={{ color: `var(--chapter-${next.discipline})` }}>
                              {text.live.disciplines[next.discipline]}
                            </span>
                            <RoundCountdown round={next} units={text.live.units} running={open} />
                          </span>
                        </Link>
                      ) : (
                        <p className="p-4 text-sm text-muted">{text.live.over}</p>
                      )}
                    </PitBoard>
                  </div>

                  <div className="menu-fade max-md:hidden" style={{ "--i": 2 } as CSSProperties}>
                    <PitBoard interactive title={s.product} meta={price}>
                      <Link
                        href={`/${lang}/store/${PICK.slug}`}
                        aria-label={fill(s.productLink, { name: productName, price })}
                        onClick={(event) => follow(event, { label: productName, href: `/${lang}/store/${PICK.slug}` })}
                        className="group flex items-center gap-4 p-4 outline-none"
                      >
                        <Picture
                          image={PICK.image}
                          alt=""
                          sizes="7rem"
                          className="h-24 w-28 shrink-0 object-contain transition-transform duration-(--dur-slow) ease-out group-hover:translate-x-1 group-hover:-rotate-3"
                        />
                        <span className="headline text-base leading-tight">{productName}</span>
                      </Link>
                    </PitBoard>
                  </div>
                </aside>

                <div className="menu-fade hidden lg:order-3 lg:block" style={{ "--i": 2 } as CSSProperties}>
                  <MenuPreview preview={preview} next={next} units={text.live.units} running={open} />
                </div>
              </div>

              <div
                className="menu-fade mt-10 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ "--i": 4 } as CSSProperties}
              >
                <nav aria-label={text.footer.label}>
                  <ul className="label flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted">
                    {footerLinks.map((entry) => (
                      <li key={entry.href}>
                        <Link
                          href={entry.href}
                          onClick={(event) => follow(event, entry)}
                          className="transition-colors duration-(--dur-fast) ease-standard hover:text-fg focus-visible:text-fg"
                        >
                          {entry.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <LanguageSwitch current={lang} label={text.footer.language} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
