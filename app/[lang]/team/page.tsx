import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { SmoothScroll } from "@/components/smooth-scroll";
import { TeamStrips } from "@/components/team/team-strips";
import { Picture } from "@/components/ui/picture";
import { Reveal } from "@/components/ui/reveal";
import { ScreenBlock } from "@/components/ui/screen-block";
import { team } from "@/content/team";
import { hasLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getMessages } from "@/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/team">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang).team;
  return pageMetadata(lang, "/team", { title: `${t.title} — Tesorra Racing`, description: t.description });
}

export default async function TeamPage({ params }: PageProps<"/[lang]/team">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).team;
  const boss = team.principal;

  return (
    <>
      <SmoothScroll />
      <h1 className="sr-only">{t.title}</h1>
      <TeamStrips lang={lang} drivers={team.drivers} t={t} />

      <ScreenBlock aria-labelledby="principal">
        <Reveal className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-12 md:gap-10">
          <div data-enter className="border border-line bg-bg p-1.5 md:col-span-7">
            <Picture
              image={boss.portrait}
              alt={t.principal.alt}
              sizes="(min-width: 768px) 56vw, 100vw"
              className="aspect-[16/10] w-full object-cover"
              style={{ objectPosition: `${boss.portraitFocus[0] * 100}% ${boss.portraitFocus[1] * 100}%` }}
            />
          </div>
          <div className="flex flex-col gap-5 md:col-span-5">
            <p data-enter className="label text-[11px] text-muted" style={{ "--i": 1 } as CSSProperties}>
              {t.principal.role} · {t.countries[boss.country as keyof typeof t.countries]} ·{" "}
              {t.principal.since.replace("{year}", String(boss.since))}
            </p>
            <h2
              id="principal"
              data-enter
              className="headline text-[clamp(40px,5vw,80px)] leading-[0.9]"
              style={{ "--i": 2 } as CSSProperties}
            >
              {boss.firstName}
              <br />
              <span className="text-amber">{boss.lastName}</span>
            </h2>
            <p data-enter className="text-[17px] leading-relaxed text-fg/90" style={{ "--i": 3 } as CSSProperties}>
              {t.principal.bio}
            </p>
            <blockquote
              data-enter
              className="quote text-[clamp(26px,2.6vw,40px)] leading-[1.05]"
              style={{ "--i": 4 } as CSSProperties}
            >
              {t.principal.quote}
            </blockquote>
          </div>
        </Reveal>
      </ScreenBlock>
    </>
  );
}
