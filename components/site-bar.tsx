import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { Wordmark } from "./brand/wordmark";
import { CockpitDisplay } from "./cockpit-display";
import { NavShortcuts } from "./nav-shortcuts";
import { SiteMenu } from "./site-menu";

/** Top bar styled as a steering-wheel display: wordmark, data line with shift lights, MENU and BOX. */
export function SiteBar({ lang, t }: { lang: Locale; t: Messages["nav"] }) {
  // Box contents arrive with the persisted cart; the count is static until then.
  const boxCount = 0;

  const shortcuts = [
    { key: "t", href: `/${lang}/team` },
    { key: "s", href: `/${lang}/season` },
    { key: "m", href: `/${lang}/store` },
    { key: "l", href: `/${lang}#live` },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <nav
        aria-label={t.label}
        className="grid h-12 w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6"
      >
        <Link
          href={`/${lang}`}
          aria-label={t.home}
          className="justify-self-start text-accent transition-colors duration-(--dur-base) ease-standard"
        >
          <Wordmark decorative className="w-[92px] sm:w-[112px]" />
        </Link>

        <CockpitDisplay t={t} />

        <div className="flex items-center gap-1 justify-self-end sm:gap-3">
          <SiteMenu t={t} />
          <Link
            href={`/${lang}/store`}
            aria-label={`${t.box}: ${boxCount} ${t.boxItems}`}
            className="label inline-flex h-8 items-center gap-1.5 px-2 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
          >
            {t.box}
            <span className="text-muted">{boxCount}</span>
          </Link>
        </div>
        <NavShortcuts shortcuts={shortcuts} />
      </nav>
    </header>
  );
}
