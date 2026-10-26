"use client";

import { useCallback } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Picture } from "@/components/ui/picture";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { FREE_SHIPPING_CENTS, getProduct, shippingFor } from "@/content/store";
import { type BoxLine, boxCount, boxSubtotal, MAX_QTY, useBox, useBoxUi } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";

export type BoxText = {
  box: Messages["box"];
  ui: Messages["ui"];
  /** Product names by slug, and the names of sizes and flavours by value. */
  names: Record<string, string>;
  options: Record<string, string>;
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** The shot of a line: its flavour's can, or the product's cut-out. */
function lineShot(line: BoxLine) {
  const product = getProduct(line.slug);
  if (!product) return null;
  return product.options?.values.find((o) => o.value === line.option)?.shot ?? product.shots[0];
}

/**
 * The box, in a drawer from the right (from the bottom on phones): each line with its shot, size
 * or flavour, quantity and a remove; the subtotal, how far free shipping is, the total and the way
 * to the checkout. A strip says the store is a demo.
 */
export function BoxDrawer({ lang, text }: { lang: Locale; text: BoxText }) {
  const { box: t, ui, names, options } = text;
  const open = useBoxUi((s) => s.open);
  const setOpen = useBoxUi((s) => s.setOpen);
  const lines = useBox((s) => s.lines);
  const setQty = useBox((s) => s.setQty);
  const remove = useBox((s) => s.remove);
  const close = useCallback(() => setOpen(false), [setOpen]);

  const subtotal = boxSubtotal(lines);
  const shipping = shippingFor(subtotal);
  const toFree = Math.max(0, FREE_SHIPPING_CENTS - subtotal);
  const name = (line: BoxLine) => `${names[line.slug] ?? line.slug}${line.option ? ` · ${options[line.option] ?? line.option}` : ""}`;

  return (
    <Drawer
      open={open}
      onClose={close}
      title={t.title}
      eyebrow={fill(t.eyebrow, { n: boxCount(lines) })}
      closeLabel={ui.close}
      footer={
        lines.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="label text-[11px] text-muted">
                {toFree > 0 ? fill(t.freeFrom, { amount: formatPrice(toFree, lang) }) : t.freeReached}
              </p>
              <span aria-hidden className="mt-2 block h-0.5 bg-line">
                <span
                  className="block h-full origin-left bg-accent transition-transform duration-(--dur-slow) ease-out"
                  style={{ transform: `scaleX(${Math.min(1, subtotal / FREE_SHIPPING_CENTS)})` }}
                />
              </span>
            </div>
            <dl className="label grid grid-cols-[1fr_auto] gap-y-1 text-xs">
              <dt className="text-muted">{t.subtotal}</dt>
              <dd className="text-right">{formatPrice(subtotal, lang)}</dd>
              <dt className="text-muted">{t.shipping}</dt>
              <dd className="text-right">{shipping === 0 ? t.free : formatPrice(shipping, lang)}</dd>
              <dt className="mt-1 text-fg">{t.total}</dt>
              <dd className="mt-1 text-right text-sm text-fg">{formatPrice(subtotal + shipping, lang)}</dd>
            </dl>
            <ButtonLink href={`/${lang}/checkout`} onClick={close} className="w-full">
              {t.checkout}
            </ButtonLink>
          </div>
        ) : null
      }
    >
      <p className="label mb-5 border border-line px-3 py-2 text-[11px] text-amber">{t.demo}</p>
      {lines.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-fg/85">{t.empty}</p>
          <ButtonLink href={`/${lang}/store`} onClick={close} variant="secondary" size="sm">
            {t.toStore}
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((line) => {
            const product = getProduct(line.slug);
            const shot = lineShot(line);
            if (!product || !shot) return null;
            return (
              <li key={line.id} className="grid grid-cols-[4.5rem_1fr] gap-4 py-4 first:pt-0">
                <span className="grid aspect-square place-items-center bg-panel p-1.5">
                  <Picture image={shot} alt="" sizes="72px" className="max-h-full w-auto object-contain" />
                </span>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="headline text-sm leading-tight">{name(line)}</p>
                    <p className="label shrink-0 text-xs">{formatPrice(product.priceCents * line.qty, lang)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <QuantityStepper
                      size="sm"
                      value={line.qty}
                      max={MAX_QTY}
                      onChange={(qty) => setQty(line.id, qty)}
                      labels={{ quantity: ui.quantity, decrease: ui.decrease, increase: ui.increase }}
                    />
                    <button
                      type="button"
                      onClick={() => remove(line.id)}
                      aria-label={fill(t.removeItem, { name: name(line) })}
                      className="label text-[11px] text-muted underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
                    >
                      {t.remove}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
