import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { LanguageSwitch } from "./language-switch";

const link =
  "transition-colors duration-(--dur-fast) ease-standard hover:text-fg";

export function SiteFooter({ lang, t }: { lang: Locale; t: Messages["footer"] }) {
  const sections = [
    { href: `/${lang}/team`, label: t.links.team },
    { href: `/${lang}/season`, label: t.links.season },
    { href: `/${lang}/store`, label: t.links.store },
    { href: `/${lang}#live`, label: t.links.live },
  ];

  return (
    <footer id="footer" className="border-t border-line text-sm text-muted">
      <div className="flex w-full flex-col gap-10 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <nav aria-label={t.label}>
            <ul className="flex flex-wrap gap-x-8 gap-y-2 font-serif text-3xl text-fg sm:text-4xl">
              {sections.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="transition-colors duration-(--dur-fast) ease-standard hover:text-accent">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <LanguageSwitch current={lang} label={t.language} />
        </div>

        <p className="max-w-xl">{t.fictional}</p>

        <div className="label flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 text-[11px]">
          <span>{t.copyright}</span>
          <Link href={`/${lang}/credits`} className={link}>
            {t.credits}
          </Link>
          <Link href={`/${lang}/legal`} className={link}>
            {t.legal}
          </Link>
        </div>
      </div>
    </footer>
  );
}
