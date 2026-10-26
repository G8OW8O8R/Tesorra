import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { BoxButton } from "./box/box-button";
import { Wordmark } from "./brand/wordmark";
import { CockpitDisplay } from "./cockpit-display";
import { NavShortcuts, type Shortcut } from "./nav-shortcuts";
import { type MenuText, SiteMenu } from "./site-menu";

/**
 * Top bar styled as a steering-wheel display: wordmark (18 px tall on phones), data line with shift
 * lights, MENU and BOX.
 */
export function SiteBar({ lang, t, menu }: { lang: Locale; t: Messages["nav"]; menu: MenuText }) {
  const shortcuts: Shortcut[] = [
    { key: "t", href: `/${lang}/team` },
    { key: "s", href: `/${lang}/store` },
    { key: "l", stop: "live" },
  ];

  return (
    <header data-site-bar className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <nav
        aria-label={t.label}
        className="grid h-12 w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6"
      >
        <Link
          href={`/${lang}`}
          aria-label={t.home}
          className="justify-self-start text-accent transition-colors duration-(--dur-base) ease-standard"
        >
          <Wordmark decorative data-bar-wordmark className="w-[88px] md:w-[112px]" />
        </Link>

        <CockpitDisplay t={t} />

        <div className="flex items-center gap-1 justify-self-end sm:gap-3">
          <SiteMenu lang={lang} t={t} text={menu} />
          <BoxButton t={t} />
        </div>
        <NavShortcuts lang={lang} shortcuts={shortcuts} />
      </nav>
    </header>
  );
}
