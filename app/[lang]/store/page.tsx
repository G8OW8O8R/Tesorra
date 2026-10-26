import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Campaign } from "@/components/store/campaign";
import { StoreBrowser } from "@/components/store/store-browser";
import { hasLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getMessages } from "@/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/store">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang).store;
  return pageMetadata(lang, "/store", { title: `${t.title} — Tesorra Racing`, description: t.description });
}

export default async function StorePage({ params }: PageProps<"/[lang]/store">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).store;

  return (
    <>
      <SmoothScroll />
      <StoreBrowser lang={lang} t={t}>
        <Campaign t={t} />
      </StoreBrowser>
    </>
  );
}
