"use client";

import Link from "next/link";
import { type ChangeEvent, type CSSProperties, type FormEvent, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Reveal } from "@/components/ui/reveal";
import { getProduct, shippingFor } from "@/content/store";
import { boxSubtotal, useBox } from "@/lib/cart";
import { type CheckoutField, type CheckoutForm, checkoutErrors, COUNTRIES, orderNumber, SPEEDS } from "@/lib/checkout";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { type Order, PaddockPass } from "./paddock-pass";

const subscribeHydration = (onChange: () => void) => useBox.persist.onFinishHydration(onChange);
const hydrated = () => useBox.persist.hasHydrated();
const notYet = () => false;

/**
 * Demo checkout: contact, address and delivery checked in the browser (nothing is sent anywhere)
 * beside what is in the box. Placing the order empties the box and hands out a paddock pass.
 */
export function CheckoutView({
  lang,
  t,
  box,
  names,
  options,
}: {
  lang: Locale;
  t: Messages["checkout"];
  box: Messages["box"];
  names: Record<string, string>;
  options: Record<string, string>;
}) {
  const ready = useSyncExternalStore(subscribeHydration, hydrated, notYet);
  const lines = useBox((s) => s.lines);
  const clear = useBox((s) => s.clear);
  const [form, setForm] = useState<CheckoutForm>({
    email: "",
    phone: "",
    name: "",
    street: "",
    postcode: "",
    city: "",
    country: lang === "pl" ? "PL" : "DE",
    speed: "standard",
  });
  const [errors, setErrors] = useState<ReturnType<typeof checkoutErrors>>({});
  const [tried, setTried] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);

  const subtotal = boxSubtotal(lines);
  const shipping = shippingFor(subtotal, form.speed);
  const label = (slug: string, option?: string) => `${names[slug] ?? slug}${option ? ` · ${options[option] ?? option}` : ""}`;

  const change = (field: CheckoutField) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next = { ...form, [field]: event.target.value } as CheckoutForm;
    setForm(next);
    if (tried) setErrors(checkoutErrors(next));
  };
  const field = (name: CheckoutField) => ({
    name,
    value: form[name],
    onChange: change(name),
    error: errors[name] ? t.errors[errors[name]] : undefined,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = checkoutErrors(form);
    setErrors(found);
    setTried(true);
    const first = (Object.keys(form) as CheckoutField[]).find((name) => found[name]);
    if (first) {
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setOrder({
      number: orderNumber(),
      date: new Date().toISOString(),
      holder: form.name.trim(),
      lines: lines.map((l) => ({
        id: l.id,
        label: label(l.slug, l.option),
        qty: l.qty,
        cents: (getProduct(l.slug)?.priceCents ?? 0) * l.qty,
      })),
      shippingCents: shipping,
      totalCents: subtotal + shipping,
    });
    clear();
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  if (order) {
    return (
      <Reveal className="mx-auto w-full max-w-5xl">
        <PaddockPass order={order} t={t.pass} lang={lang} storeHref={`/${lang}/store`} />
      </Reveal>
    );
  }

  return (
    <Reveal className="mx-auto w-full max-w-6xl">
      <header data-enter>
        <p className="label text-[11px] text-muted">{t.eyebrow}</p>
        <h1 className="headline mt-3 text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.9]">{t.heading}</h1>
        <p className="label mt-5 inline-block border border-line px-3 py-2 text-[11px] text-amber">{t.demo}</p>
      </header>

      {!ready ? null : lines.length === 0 ? (
        <div data-enter className="mt-12 flex flex-col items-start gap-4" style={{ "--i": 1 } as CSSProperties}>
          <p className="text-fg/85">{t.empty}</p>
          <Link
            href={`/${lang}/store`}
            className="label text-[11px] text-fg underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
          >
            {box.toStore} →
          </Link>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="mt-12 grid gap-10 md:grid-cols-12">
          <div className="flex flex-col gap-10 md:col-span-7">
            <fieldset data-enter className="flex flex-col gap-5" style={{ "--i": 1 } as CSSProperties}>
              <legend className="label mb-5 text-xs text-fg">{t.contact}</legend>
              <TextField label={t.email} type="email" autoComplete="email" required requiredLabel={t.required} {...field("email")} />
              <TextField label={t.phone} type="tel" autoComplete="tel" hint={t.optional} {...field("phone")} />
            </fieldset>
            <fieldset data-enter className="flex flex-col gap-5" style={{ "--i": 2 } as CSSProperties}>
              <legend className="label mb-5 text-xs text-fg">{t.address}</legend>
              <TextField label={t.name} autoComplete="name" required requiredLabel={t.required} {...field("name")} />
              <TextField label={t.street} autoComplete="street-address" required requiredLabel={t.required} {...field("street")} />
              <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-4">
                <TextField label={t.postcode} autoComplete="postal-code" required requiredLabel={t.required} {...field("postcode")} />
                <TextField label={t.city} autoComplete="address-level2" required requiredLabel={t.required} {...field("city")} />
              </div>
              <SelectField label={t.country} autoComplete="country" required requiredLabel={t.required} {...field("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {t.countries[c]}
                  </option>
                ))}
              </SelectField>
            </fieldset>
            <fieldset data-enter style={{ "--i": 3 } as CSSProperties}>
              <legend className="label mb-5 text-xs text-fg">{t.delivery}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {SPEEDS.map((speed) => {
                  const cost = shippingFor(subtotal, speed);
                  return (
                    <label
                      key={speed}
                      className="flex cursor-pointer items-center justify-between gap-4 border border-line px-4 py-3 transition-colors duration-(--dur-fast) ease-standard hover:border-fg/25 has-checked:border-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber"
                    >
                      <input
                        type="radio"
                        name="speed"
                        value={speed}
                        checked={form.speed === speed}
                        onChange={change("speed")}
                        className="sr-only"
                      />
                      <span>
                        <span className="block text-sm text-fg">{t.speeds[speed].label}</span>
                        <span className="label block text-[11px] text-muted">{t.speeds[speed].note}</span>
                      </span>
                      <span className="label text-xs">{cost === 0 ? box.free : formatPrice(cost, lang)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <aside data-enter className="md:col-span-5" style={{ "--i": 2 } as CSSProperties}>
            <div className="border border-line bg-panel p-5 md:sticky md:top-[calc(var(--bar-h)+1.5rem)]">
              <h2 className="label text-xs text-fg">{t.summary}</h2>
              <ul className="label mt-4 flex flex-col gap-2 text-xs">
                {lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-4">
                    <span className="text-fg/85">
                      {l.qty} × {label(l.slug, l.option)}
                    </span>
                    <span className="shrink-0">{formatPrice((getProduct(l.slug)?.priceCents ?? 0) * l.qty, lang)}</span>
                  </li>
                ))}
              </ul>
              <dl className="label mt-5 grid grid-cols-[1fr_auto] gap-y-1 border-t border-line pt-4 text-xs">
                <dt className="text-muted">{box.subtotal}</dt>
                <dd className="text-right">{formatPrice(subtotal, lang)}</dd>
                <dt className="text-muted">{box.shipping}</dt>
                <dd className="text-right">{shipping === 0 ? box.free : formatPrice(shipping, lang)}</dd>
                <dt className="mt-1 text-fg">{box.total}</dt>
                <dd className="mt-1 text-right text-sm text-amber">{formatPrice(subtotal + shipping, lang)}</dd>
              </dl>
              <Button type="submit" className="mt-6 w-full">
                {t.place}
              </Button>
            </div>
          </aside>
        </form>
      )}
    </Reveal>
  );
}
