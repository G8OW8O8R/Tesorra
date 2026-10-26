import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SmoothScroll } from "@/components/smooth-scroll";
import { DriverPage } from "@/components/team/driver-page";
import { getDriver, team } from "@/content/team";
import { hasLocale, locales } from "@/lib/i18n";
import { fallbackSrc } from "@/lib/images";
import { jsonLd, localeUrl, pageMetadata, siteName, siteUrl } from "@/lib/seo";
import { getMessages } from "@/messages";

export function generateStaticParams() {
  return locales.flatMap((lang) => team.drivers.map((d) => ({ lang, driver: d.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/team/[driver]">): Promise<Metadata> {
  const { lang, driver } = await params;
  const d = getDriver(driver);
  if (!hasLocale(lang) || !d) return {};
  const t = getMessages(lang).team;
  return pageMetadata(lang, `/team/${d.slug}`, {
    title: `${d.firstName} ${d.lastName} #${d.number} — Tesorra Racing`,
    description: t.drivers[d.key].bio.split(". ")[0] + ".",
  });
}

/**
 * The driver comes from the address, so the page streams in behind Suspense after a client
 * navigation (every driver is prerendered, so a direct visit gets it whole).
 */
export default function DriverRoute({ params }: PageProps<"/[lang]/team/[driver]">) {
  return (
    <>
      <SmoothScroll />
      <Suspense fallback={<div className="block-screen" />}>
        <Driver params={params} />
      </Suspense>
    </>
  );
}

async function Driver({ params }: Pick<PageProps<"/[lang]/team/[driver]">, "params">) {
  const { lang, driver } = await params;
  const index = team.drivers.findIndex((d) => d.slug === driver);
  if (!hasLocale(lang) || index < 0) notFound();
  const t = getMessages(lang).team;
  const d = team.drivers[index];
  const structured = {
    "@type": "Person",
    name: `${d.firstName} ${d.lastName}`,
    givenName: d.firstName,
    familyName: d.lastName,
    url: localeUrl(lang, `/team/${d.slug}`),
    image: siteUrl + fallbackSrc(d.portrait),
    nationality: { "@type": "Country", name: t.countries[d.country as keyof typeof t.countries] },
    jobTitle: `${t.disciplines[d.discipline]} #${d.number}`,
    description: t.drivers[d.key].bio,
    memberOf: { "@type": "SportsTeam", name: siteName, url: localeUrl(lang) },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <DriverPage lang={lang} t={t} drivers={team.drivers} initial={index} />
    </>
  );
}
