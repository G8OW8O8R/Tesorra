export const locales = ["en", "pl"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Replaces or adds the locale segment at the start of a pathname. */
export function localizePath(pathname: string, locale: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && hasLocale(segments[0])) segments.shift();
  return `/${[locale, ...segments].join("/")}`;
}
