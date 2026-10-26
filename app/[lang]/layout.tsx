import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoxDrawer } from "@/components/box/box-drawer";
import { BoxRadio } from "@/components/box/box-radio";
import { SiteFooter } from "@/components/site-footer";
import { SiteBar } from "@/components/site-bar";
import { fontVariables } from "@/lib/fonts";
import { hasLocale, locales } from "@/lib/i18n";
import { INTRO_SCRIPT } from "@/lib/intro";
import { siteName, siteUrl } from "@/lib/seo";
import { getMessages } from "@/messages";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang);
  return {
    metadataBase: new URL(siteUrl),
    applicationName: siteName,
    title: t.meta.title,
    description: t.meta.description,
    formatDetection: { telephone: false },
  };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang);
  // The bar gets product names only, not the whole store.
  const names = Object.fromEntries(Object.entries(t.store.products).map(([slug, p]) => [slug, p.name]));

  return (
    // The intro script marks <html> before hydration.
    <html lang={lang} className={`${fontVariables} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      {/* Browser extensions add attributes to <body> before hydration. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <SiteBar lang={lang} t={t.nav} menu={{ live: t.home.live, names, footer: t.footer }} />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter lang={lang} t={t.footer} />
        <BoxDrawer lang={lang} text={{ box: t.box, ui: t.ui, names, options: { ...t.store.flavours, ...t.store.sizes } }} />
        <BoxRadio t={t.box.radio} />
      </body>
    </html>
  );
}
