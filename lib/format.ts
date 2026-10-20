import type { Locale } from "./i18n";

const intlLocale: Record<Locale, string> = { en: "en-IE", pl: "pl-PL" };

/** Formats a price held in euro cents for the given site locale. */
export function formatPrice(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
