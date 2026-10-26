import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SmoothScroll } from "@/components/smooth-scroll";
import { ProductView, type WornBy } from "@/components/store/product-view";
import { StoreCard } from "@/components/store/store-card";
import { Reveal } from "@/components/ui/reveal";
import { ScreenBlock } from "@/components/ui/screen-block";
import { getProduct, products, relatedProducts } from "@/content/store";
import { team } from "@/content/team";
import { hasLocale, locales } from "@/lib/i18n";
import { fallbackSrc } from "@/lib/images";
import { jsonLd, localeUrl, pageMetadata, siteName, siteUrl } from "@/lib/seo";
import { getMessages, type Messages } from "@/messages";

type StoreProducts = Messages["store"]["products"];

export function generateStaticParams() {
  return locales.flatMap((lang) => products.map((p) => ({ lang, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/store/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!hasLocale(lang) || !product) return {};
  const text = getMessages(lang).store.products[product.slug as keyof StoreProducts];
  return pageMetadata(lang, `/store/${product.slug}`, { title: `${text.name} — Tesorra Racing`, description: text.line });
}

/**
 * The product comes from the address, so it streams in behind Suspense after a client navigation
 * (every product is prerendered, so a direct visit gets it whole).
 */
export default function ProductRoute({ params }: PageProps<"/[lang]/store/[slug]">) {
  return (
    <>
      <SmoothScroll />
      <Suspense fallback={<div className="block-screen" />}>
        <ProductPage params={params} />
      </Suspense>
    </>
  );
}

async function ProductPage({ params }: Pick<PageProps<"/[lang]/store/[slug]">, "params">) {
  const { lang, slug } = await params;
  const product = getProduct(slug);
  if (!hasLocale(lang) || !product) notFound();
  const messages = getMessages(lang);
  const t = messages.store;
  const text = t.products[product.slug as keyof StoreProducts];
  const worn: WornBy[] = product.wornBy.flatMap((number) => {
    const d = team.drivers.find((driver) => driver.number === number);
    return d ? [{ number, name: d.lastName, href: `/${lang}/team/${d.slug}` }] : [];
  });

  const structured = {
    "@type": "Product",
    name: text.name,
    description: text.description,
    sku: product.slug,
    image: product.shots.map((shot) => siteUrl + fallbackSrc(shot)),
    brand: { "@type": "Brand", name: siteName },
    offers: {
      "@type": "Offer",
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: product.limited ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      url: localeUrl(lang, `/store/${product.slug}`),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structured) }}
      />
      <ProductView lang={lang} t={t} ui={messages.ui} product={product} worn={worn} />
      <ScreenBlock aria-labelledby="related" className="pt-0!">
        <h2 id="related" className="label text-xs text-muted">
          {t.related}
        </h2>
        <Reveal className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {relatedProducts(product).map((p, i) => (
            <StoreCard key={p.slug} lang={lang} t={t} product={p} index={i} />
          ))}
        </Reveal>
      </ScreenBlock>
      {/* Room for the phone's Add to box bar over the end of the page. */}
      <div aria-hidden className="h-20 md:hidden" />
    </>
  );
}
