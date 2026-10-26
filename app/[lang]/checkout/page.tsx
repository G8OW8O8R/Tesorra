import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { SmoothScroll } from "@/components/smooth-scroll";
import { ScreenBlock } from "@/components/ui/screen-block";
import { hasLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getMessages } from "@/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/checkout">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang).checkout;
  return pageMetadata(lang, "/checkout", { title: `${t.title} — Tesorra Racing`, description: t.description, index: false });
}

export default async function CheckoutPage({ params }: PageProps<"/[lang]/checkout">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const m = getMessages(lang);
  const names = Object.fromEntries(Object.entries(m.store.products).map(([slug, p]) => [slug, p.name]));

  return (
    <>
      <SmoothScroll />
      <ScreenBlock screen className="pt-[8svh]">
        <CheckoutView
          lang={lang}
          t={m.checkout}
          box={m.box}
          names={names}
          options={{ ...m.store.flavours, ...m.store.sizes }}
        />
      </ScreenBlock>
    </>
  );
}
