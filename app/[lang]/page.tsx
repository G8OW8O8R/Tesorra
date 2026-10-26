import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeRide } from "@/components/home/home-ride";
import { StartLights } from "@/components/home/start-lights";
import { team } from "@/content/team";
import { hasLocale } from "@/lib/i18n";
import { jsonLd, localeUrl, pageMetadata, siteName, siteUrl } from "@/lib/seo";
import { getMessages } from "@/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang).meta;
  return pageMetadata(lang, "", { title: t.title, description: t.description });
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const messages = getMessages(lang);
  const t = messages.home;

  const structured = {
    "@type": "SportsTeam",
    name: siteName,
    url: localeUrl(lang),
    logo: `${siteUrl}/icon-512.png`,
    description: messages.meta.description,
    sport: ["Drifting", "Motor racing", "Motorcycle racing"],
    coach: { "@type": "Person", name: `${team.principal.firstName} ${team.principal.lastName}` },
    athlete: team.drivers.map((d) => ({
      "@type": "Person",
      name: `${d.firstName} ${d.lastName}`,
      url: localeUrl(lang, `/team/${d.slug}`),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <StartLights />
      <HomeRide lang={lang} t={t} products={messages.store.products} />
    </>
  );
}
