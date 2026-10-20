import type { Metadata } from "next";
import { OffTrack } from "@/components/off-track";
import { defaultLocale } from "@/lib/i18n";
import { fontVariables } from "@/lib/fonts";
import { getMessages } from "@/messages";
import "./globals.css";

const t = getMessages(defaultLocale).notFound;

export const metadata: Metadata = {
  title: `${t.heading} — Tesorra Racing`,
};

export default function GlobalNotFound() {
  return (
    <html lang={defaultLocale} className={`${fontVariables} h-full`}>
      {/* Browser extensions add attributes to <body> before hydration. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <main className="flex flex-1 flex-col">
          <OffTrack t={t} homeHref={`/${defaultLocale}`} />
        </main>
      </body>
    </html>
  );
}
