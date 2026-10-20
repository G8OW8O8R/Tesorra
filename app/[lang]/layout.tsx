import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteBar } from "@/components/site-bar";
import { fontVariables } from "@/lib/fonts";
import { hasLocale, locales } from "@/lib/i18n";
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
  return { title: t.meta.title, description: t.meta.description };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang);

  return (
    <html lang={lang} className={`${fontVariables} h-full`}>
      {/* Browser extensions add attributes to <body> before hydration. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <SiteBar lang={lang} t={t.nav} />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter lang={lang} t={t.footer} />
      </body>
    </html>
  );
}
