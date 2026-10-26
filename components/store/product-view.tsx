"use client";

import Link from "next/link";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Picture } from "@/components/ui/picture";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Reveal } from "@/components/ui/reveal";
import { VariantPicker } from "@/components/ui/variant-picker";
import { categoryColour, type Product } from "@/content/store";
import { addToBox, MAX_QTY } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { images } from "@/lib/images";
import { HERO_NAME } from "@/lib/view-transition";
import type { Messages } from "@/messages";
import { StoreDust } from "./store-dust";

type StoreText = Messages["store"];
export type WornBy = { number: string; name: string; href: string };

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash.slice(1);
const noHash = () => "";

/** A drag this far (px) turns to the next shot. */
const SWIPE = 50;
/** How long the button says the product is in the box (ms). */
const ADDED_MS = 1600;

/**
 * A product over the dust in the colour of its part of the store (a drink in its flavour's): the
 * shots large in the middle (drag, arrows or the arrow keys to turn them), and beside them the
 * panel: part of the store, name, price, size or flavour, quantity, Add to box, the story, details
 * and who wears it. Phones keep Add to box on a bar along the bottom. The shot on show is the one
 * a product opened from the float space carries over into (`data-product-hero`).
 */
export function ProductView({
  lang,
  t,
  ui,
  product,
  worn,
}: {
  lang: Locale;
  t: StoreText;
  ui: Messages["ui"];
  product: Product;
  worn: WornBy[];
}) {
  const text = t.products[product.slug as keyof StoreText["products"]];
  const options = product.options;
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [chosen, setChosen] = useState<string | null>(null);
  const [shot, setShot] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef(0);
  const drag = useRef<{ x: number; id: number } | null>(null);

  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  const fromHash = options?.values.find((o) => o.value === hash)?.value;
  const option = chosen ?? fromHash ?? (options?.kind === "size" ? "m" : options?.values[0].value);
  const picked = options?.values.find((o) => o.value === option);
  const optionShot = picked?.shot ? product.shots.indexOf(picked.shot) : -1;
  const current = shot ?? (optionShot >= 0 ? optionShot : 0);
  const count = product.shots.length;
  const colour = picked?.colour ?? categoryColour[product.category];
  const flavour = options?.kind === "flavour" && option ? t.flavours[option as keyof StoreText["flavours"]] : "";
  const price = formatPrice(product.priceCents, lang);

  const turn = (by: number) => setShot((current + by + count) % count);
  const choose = (value: string) => {
    setChosen(value);
    const next = options?.values.find((o) => o.value === value);
    if (next?.shot) setShot(product.shots.indexOf(next.shot));
  };
  const add = () => {
    addToBox(product.slug, options ? option : undefined, qty);
    setAdded(true);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setAdded(false), ADDED_MS);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      turn(event.key === "ArrowLeft" ? -1 : 1);
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (count < 2) return;
    drag.current = { x: event.clientX, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => {
    const from = drag.current;
    drag.current = null;
    if (!from || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x;
    if (Math.abs(dx) > SWIPE) turn(dx < 0 ? 1 : -1);
  };

  const buy = (
    <Button onClick={add} aria-live="polite" className="min-w-0 flex-1 md:min-w-[10rem]">
      {added ? t.added : t.addToBox}
    </Button>
  );
  const stepper = (size: "sm" | "md") => (
    <QuantityStepper
      value={qty}
      onChange={setQty}
      max={MAX_QTY}
      size={size}
      labels={{ quantity: ui.quantity, decrease: ui.decrease, increase: ui.increase }}
    />
  );

  return (
    <>
      <StoreDust colour={colour} />
      <section
        className="relative z-10 grid min-h-[calc(100svh-var(--bar-h))] items-center gap-8 px-(--gutter) pt-6 pb-28 md:grid-cols-12 md:gap-10 md:pb-[calc(var(--dock-h)+32px)]"
        style={{ "--accent": colour } as CSSProperties}
      >
        <div className="md:col-span-7">
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label={t.gallery}
            tabIndex={count > 1 ? 0 : -1}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null;
            }}
            className={`relative h-[44svh] touch-pan-y outline-none select-none focus-visible:ring-1 focus-visible:ring-accent md:h-[68svh] ${
              count > 1 ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          >
            {product.shots.map((s, i) => {
              const on = i === current;
              return (
                <div
                  key={s}
                  aria-hidden={!on}
                  className={`absolute inset-0 transition-[opacity,translate] duration-(--dur-slow) ease-out ${
                    on ? "translate-x-0 opacity-100" : `opacity-0 ${i < current ? "-translate-x-[8%]" : "translate-x-[8%]"}`
                  }`}
                >
                  <Picture
                    image={s}
                    alt={`${text.name}${flavour ? ` ${flavour}` : ""} — ${t.shotOf.replace("{n}", String(i + 1)).replace("{total}", String(count))}`}
                    sizes="(min-width: 768px) 58vw, 100vw"
                    loading={i === current ? "eager" : "lazy"}
                    draggable={false}
                    className={`size-full ${images[s].alpha ? "object-contain" : "object-contain md:p-[4%]"}`}
                    {...(on ? { "data-product-hero": "", style: { viewTransitionName: HERO_NAME } } : {})}
                  />
                </div>
              );
            })}
          </div>
          {count > 1 ? (
            <div className="label mt-4 flex items-center justify-center gap-5 text-xs text-muted">
              <button
                type="button"
                aria-label={t.previousShot}
                onClick={() => turn(-1)}
                className="inline-flex h-10 w-10 items-center justify-center transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
              >
                ←
              </button>
              <span aria-live="polite" className="tabular-nums text-fg">
                {String(current + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              </span>
              <button
                type="button"
                aria-label={t.nextShot}
                onClick={() => turn(1)}
                className="inline-flex h-10 w-10 items-center justify-center transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
              >
                →
              </button>
            </div>
          ) : null}
        </div>

        <Reveal className="flex flex-col gap-6 md:col-span-5 lg:col-span-4 lg:col-start-9">
          <p data-enter className="label flex flex-wrap gap-x-3 text-[11px] text-muted">
            <Link href={`/${lang}/store`} className="transition-colors duration-(--dur-fast) ease-standard hover:text-fg">
              ← {t.back}
            </Link>
            <span>
              {t.categories[product.category]}
              {product.limited ? ` · ${t.limited}` : ""}
            </span>
          </p>
          <div data-enter style={{ "--i": 1 } as CSSProperties}>
            <h1 className="headline text-[clamp(2.2rem,4.2vw,4rem)] leading-[0.92]">
              {text.name}
              {flavour ? <span className="block text-accent">{flavour}</span> : null}
            </h1>
            <p className="label mt-3 text-xl text-fg">{price}</p>
          </div>
          <p data-enter className="text-fg/85" style={{ "--i": 2 } as CSSProperties}>
            {text.line}
          </p>
          {options ? (
            <div data-enter style={{ "--i": 3 } as CSSProperties}>
              <VariantPicker
                name={`${product.slug}-${options.kind}`}
                legend={t.optionKinds[options.kind]}
                value={option}
                onChange={choose}
                unavailableLabel={ui.unavailable}
                options={options.values.map((o) => ({
                  value: o.value,
                  label:
                    options.kind === "flavour"
                      ? t.flavours[o.value as keyof StoreText["flavours"]]
                      : t.sizes[o.value as keyof StoreText["sizes"]],
                  swatch: o.colour,
                }))}
              />
            </div>
          ) : null}
          <div data-enter className="flex gap-3 max-md:hidden" style={{ "--i": 4 } as CSSProperties}>
            {stepper("md")}
            {buy}
          </div>
          <div data-enter className="border-t border-line pt-5" style={{ "--i": 5 } as CSSProperties}>
            <h2 className="label text-[11px] text-muted">{t.about}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-fg/90">{text.description}</p>
          </div>
          <dl data-enter className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 border-t border-line pt-5 text-sm" style={{ "--i": 6 } as CSSProperties}>
            <dt className="label text-[11px] text-muted">{t.material}</dt>
            <dd className="text-fg/85">{text.material}</dd>
            <dt className="label text-[11px] text-muted">{t.shipping}</dt>
            <dd className="text-fg/85">{t.shippingNote}</dd>
            {worn.length > 0 ? (
              <>
                <dt className="label text-[11px] text-muted">{t.wornBy}</dt>
                <dd className="label flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {worn.map((w) => (
                    <Link
                      key={w.number}
                      href={w.href}
                      className="text-fg underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-current"
                    >
                      #{w.number} {w.name}
                    </Link>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        </Reveal>
      </section>

      {/* Phones: price and Add to box stay along the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-bg/90 px-(--gutter) pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        <span className="label text-sm text-fg">{price}</span>
        {stepper("sm")}
        {buy}
      </div>
    </>
  );
}
