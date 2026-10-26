import type { MetadataRoute } from "next";
import { products } from "@/content/store";
import { team } from "@/content/team";
import { defaultLocale, locales } from "@/lib/i18n";
import { localeUrl } from "@/lib/seo";

const paths = [
  { path: "", priority: 1 },
  { path: "/team", priority: 0.8 },
  ...team.drivers.map((d) => ({ path: `/team/${d.slug}`, priority: 0.8 })),
  { path: "/store", priority: 0.8 },
  ...products.map((p) => ({ path: `/store/${p.slug}`, priority: 0.6 })),
  { path: "/credits", priority: 0.2 },
  { path: "/legal", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((lang) =>
    paths.map(({ path, priority }) => ({
      url: localeUrl(lang, path),
      changeFrequency: "monthly" as const,
      priority,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((l) => [l, localeUrl(l, path)])),
          "x-default": localeUrl(defaultLocale, path),
        },
      },
    })),
  );
}
