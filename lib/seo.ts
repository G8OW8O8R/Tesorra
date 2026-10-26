import type { Metadata } from "next";
import { defaultLocale, type Locale, locales } from "@/lib/i18n";

/**
 * Absolute origin of the site: `NEXT_PUBLIC_SITE_URL` when set, otherwise the production domain
 * Vercel provides, otherwise localhost.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");

export const siteName = "Tesorra Racing";

const OG_IMAGE = { url: "/og.jpg", width: 1200, height: 630, alt: siteName };

/** `path` is the address after the locale, e.g. `""`, `/store` or `/team/21-wierzbicki`. */
export function localeUrl(lang: Locale, path = ""): string {
  return `${siteUrl}/${lang}${path}`;
}

/** Title, description, canonical, hreflang alternates and Open Graph for one page. */
export function pageMetadata(
  lang: Locale,
  path: string,
  { title, description, index = true }: { title: string; description: string; index?: boolean },
): Metadata {
  const languages: Record<string, string> = Object.fromEntries(locales.map((l) => [l, `/${l}${path}`]));
  languages["x-default"] = `/${defaultLocale}${path}`;
  return {
    title,
    description,
    alternates: { canonical: `/${lang}${path}`, languages },
    openGraph: {
      type: "website",
      siteName,
      title,
      description,
      url: `/${lang}${path}`,
      locale: lang === "pl" ? "pl_PL" : "en_GB",
      alternateLocale: lang === "pl" ? ["en_GB"] : ["pl_PL"],
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

/** JSON-LD for a `<script type="application/ld+json">`, safe inside HTML. */
export function jsonLd(data: object): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\u003c");
}
