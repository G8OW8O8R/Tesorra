"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Locale, localizePath, locales } from "@/lib/i18n";

export function LanguageSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname() ?? `/${current}`;

  return (
    <nav aria-label={label}>
      <ul className="flex gap-1.5">
        {locales.map((locale) => (
          <li key={locale}>
            <Link
              href={localizePath(pathname, locale)}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              className="label inline-flex h-8 items-center border border-line px-3 text-[11px] text-muted transition-colors duration-(--dur-fast) ease-standard hover:text-fg aria-[current]:text-fg"
            >
              {locale}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
