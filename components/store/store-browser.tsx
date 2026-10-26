"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getSmoothScroll } from "@/components/smooth-scroll";
import { Reveal } from "@/components/ui/reveal";
import { type CategoryFilter, categories, categoryColour, floatItems, productsIn } from "@/content/store";
import type { Locale } from "@/lib/i18n";
import { FIELD_SCREENS, interleave } from "@/lib/store-float";
import { carryInto } from "@/lib/view-transition";
import type { Messages } from "@/messages";
import { FieldBackdrop } from "./field-backdrop";
import { FloatSpace, LEAVE_MS } from "./float-space";
import { StoreCard } from "./store-card";
import { StoreDust } from "./store-dust";

type StoreText = Messages["store"];
type Mode = "float" | "list";

/** The part of the store in the address: /store#helmets. */
const HASHES: Record<CategoryFilter, string> = {
  all: "",
  drink: "drink",
  helmets: "helmets",
  gear: "drift-gear",
  apparel: "apparel",
};
const FILTERS: CategoryFilter[] = ["all", ...categories];

const hashListeners = new Set<() => void>();
function subscribeHash(onChange: () => void) {
  hashListeners.add(onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    hashListeners.delete(onChange);
    window.removeEventListener("hashchange", onChange);
  };
}
function categoryInHash(): CategoryFilter {
  const hash = window.location.hash.slice(1);
  return FILTERS.find((c) => c !== "all" && HASHES[c] === hash) ?? "all";
}
function writeHash(category: CategoryFilter) {
  const { pathname, search } = window.location;
  history.replaceState(history.state, "", `${pathname}${search}${HASHES[category] ? `#${HASHES[category]}` : ""}`);
  hashListeners.forEach((listener) => listener());
}

/** Phones and reduced motion start with the list. */
const LIST_FIRST = "(max-width: 47.99rem), (prefers-reduced-motion: reduce)";
const PHONE = "(max-width: 47.99rem)";
const subscribeQuery = (query: string) => (onChange: () => void) => {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};
const subscribeListFirst = subscribeQuery(LIST_FIRST);
const subscribePhone = subscribeQuery(PHONE);

/**
 * The store: the heading (`children`) over the products — a long field of them afloat over the
 * dust (FLOAT) or pit boards in a grid (LIST) — with the mono dock along the bottom the whole way
 * down: the parts of the store and the view switch. A new part of the store takes the field back
 * to its top, sends the products back into the dust and brings the next ones out, and the dust
 * takes its colour. LIST is the start on phones, under reduced motion and as soon as the keyboard
 * is used; a choice made with the switch stays.
 */
export function StoreBrowser({ lang, t, children }: { lang: Locale; t: StoreText; children: ReactNode }) {
  const router = useRouter();
  const section = useRef<HTMLElement>(null);
  const category = useSyncExternalStore(subscribeHash, categoryInHash, () => "all" as const);
  const listFirst = useSyncExternalStore(subscribeListFirst, () => window.matchMedia(LIST_FIRST).matches, () => true);
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);
  const [chosen, setChosen] = useState<Mode | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  /** The part of the store asked for while the current one goes back into the dust. */
  const [pending, setPending] = useState<CategoryFilter | null>(null);
  const mode: Mode = chosen ?? (listFirst || keyboard ? "list" : "float");
  const active = pending ?? category;
  // One array per part of the store: the float space restarts only when the set changes.
  const afloat = useMemo(
    () => (category === "all" ? interleave(floatItems("all"), (item) => item.product.category) : floatItems(category)),
    [category],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      setKeyboard(true);
      window.removeEventListener("keydown", onKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Arriving at (or sent to) a part of the store: straight to the products.
  useEffect(() => {
    const toProducts = () => {
      const el = section.current;
      if (!el || categoryInHash() === "all") return;
      const smooth = getSmoothScroll();
      if (smooth) smooth.scrollTo(el, { offset: 0 });
      else el.scrollIntoView({ behavior: "instant", block: "start" });
    };
    toProducts();
    window.addEventListener("hashchange", toProducts);
    return () => window.removeEventListener("hashchange", toProducts);
  }, []);

  const jumpToProducts = () => {
    const el = section.current;
    if (!el) return;
    const smooth = getSmoothScroll();
    if (smooth) smooth.scrollTo(el, { offset: 0, immediate: true });
    else el.scrollIntoView({ behavior: "instant", block: "start" });
  };

  // The field goes back to its top while the products go back into the dust, and the next part
  // of the store comes out once both are done; the list just jumps to its top.
  const pick = (next: CategoryFilter) => {
    if (next === active) return;
    const el = section.current;
    const away = el ? el.getBoundingClientRect().top < 0 : false;
    if (mode === "list" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      writeHash(next);
      if (away) jumpToProducts();
      return;
    }
    setPending(next);
    let waiting = 2;
    const done = () => {
      if (--waiting > 0) return;
      writeHash(next);
      setPending(null);
    };
    window.setTimeout(done, LEAVE_MS);
    const smooth = getSmoothScroll();
    if (el && away && smooth) smooth.scrollTo(el, { offset: 0, duration: 1, onComplete: done });
    else {
      if (el && away) el.scrollIntoView({ behavior: "instant", block: "start" });
      done();
    }
  };

  const colour = categoryColour[active];

  return (
    <div className="relative" style={{ "--accent": colour } as CSSProperties}>
      <StoreDust colour={colour} />
      {mode === "float" ? <FieldBackdrop field={section} /> : null}
      {children}
      <section
        ref={section}
        aria-label={t.spaceLabel}
        className="relative z-10 scroll-mt-(--bar-h)"
        style={mode === "float" ? { height: `${FIELD_SCREENS * 100}svh` } : undefined}
      >
        <h2 className="sr-only">{t.spaceLabel}</h2>
        {mode === "float" ? (
          <FloatSpace
            key={category}
            lang={lang}
            t={t}
            items={afloat}
            phone={phone}
            leaving={pending !== null}
            onOpen={(href, picture) => carryInto(href, picture, (to) => router.push(to))}
          />
        ) : (
          <Reveal
            key={category}
            className="grid grid-cols-2 gap-3 px-(--gutter) pt-[10svh] pb-[8svh] md:grid-cols-3 md:gap-5 lg:grid-cols-4"
          >
            {productsIn(category).map((product, i) => (
              <StoreCard key={product.slug} lang={lang} t={t} product={product} index={i} />
            ))}
          </Reveal>
        )}
      </section>

      <div className="sticky bottom-0 z-20 border-t border-line bg-bg/85 backdrop-blur-md">
        <div className="flex h-(--dock-h) items-center justify-between gap-4 pb-[env(safe-area-inset-bottom)] pl-(--gutter)">
          <div
            role="group"
            aria-label={t.categoriesLabel}
            className="label flex min-w-0 gap-x-5 overflow-x-auto text-xs [scrollbar-width:none] md:gap-x-8 md:text-[13px]"
          >
            {FILTERS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === active}
                onClick={() => pick(c)}
                className="relative h-10 shrink-0 whitespace-nowrap text-muted transition-colors duration-(--dur-fast) ease-standard hover:text-fg aria-pressed:text-(color:--c)"
                style={{ "--c": categoryColour[c] } as CSSProperties}
              >
                {t.categories[c]}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-1.5 h-px bg-(color:--c) transition-transform duration-(--dur-base) ease-out ${
                    c === active ? "scale-x-100" : "scale-x-0"
                  } origin-left`}
                />
              </button>
            ))}
          </div>
          <div role="group" aria-label={t.views.label} className="label flex shrink-0 pr-(--gutter) text-xs md:text-[13px]">
            {(["float", "list"] as const).map((m, i) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setChosen(m)}
                className="h-10 px-1.5 text-muted transition-colors duration-(--dur-fast) ease-standard hover:text-fg aria-pressed:text-fg"
              >
                {i > 0 ? <span aria-hidden className="mr-3 text-muted">/</span> : null}
                {t.views[m]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
