import { notFound } from "next/navigation";
import { HomeRide } from "@/components/home/home-ride";
import { StartLights } from "@/components/home/start-lights";
import { hasLocale } from "@/lib/i18n";
import { getMessages } from "@/messages";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).home;

  return (
    <>
      <StartLights />
      <HomeRide lang={lang} t={t} />
    </>
  );
}
