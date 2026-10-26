import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { SmoothScroll } from "@/components/smooth-scroll";
import { PitBoard } from "@/components/ui/pit-board";
import { Reveal } from "@/components/ui/reveal";
import { ScreenBlock } from "@/components/ui/screen-block";
import { fonts, models } from "@/content/credits";
import { hasLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getMessages } from "@/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/credits">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang).credits;
  return pageMetadata(lang, "/credits", { title: `${t.title} — Tesorra Racing`, description: t.description });
}

const link =
  "underline decoration-fg/30 underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-accent";

export default async function CreditsPage({ params }: PageProps<"/[lang]/credits">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).credits;

  return (
    <>
      <SmoothScroll />
      <ScreenBlock className="pt-[14svh]">
        <Reveal className="mx-auto flex w-full max-w-6xl flex-col gap-14">
          <header className="flex flex-col gap-4">
            <p data-enter className="label text-[11px] text-muted">
              {t.eyebrow}
            </p>
            <h1
              data-enter
              className="headline text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.9]"
              style={{ "--i": 1 } as CSSProperties}
            >
              {t.heading}
            </h1>
            <p data-enter className="max-w-xl text-[17px] leading-relaxed text-fg/90" style={{ "--i": 2 } as CSSProperties}>
              {t.line}
            </p>
          </header>

          <section aria-labelledby="models" className="flex flex-col gap-5">
            <div data-enter className="flex flex-col gap-1" style={{ "--i": 3 } as CSSProperties}>
              <h2 id="models" className="label text-xs text-fg">
                {t.modelsTitle}
              </h2>
              <p className="text-sm text-muted">{t.modelsNote}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {models.map((m, i) => (
                <li key={m.key} data-enter style={{ "--i": 4 + i } as CSSProperties}>
                  <PitBoard title={`M${i + 1}`} meta={m.license} className="h-full">
                    <div className="flex flex-col gap-3 p-5">
                      <p className="headline text-2xl leading-none">{t.models[m.key]}</p>
                      <p className="text-sm text-muted">
                        {t.by} <span className="text-fg">{m.author}</span>
                      </p>
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className={`label text-[11px] ${link}`}>
                        {t.source} ↗
                      </a>
                    </div>
                  </PitBoard>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="fonts" className="flex flex-col gap-5">
            <div data-enter className="flex flex-col gap-1" style={{ "--i": 8 } as CSSProperties}>
              <h2 id="fonts" className="label text-xs text-fg">
                {t.fontsTitle}
              </h2>
              <p className="text-sm text-muted">{t.fontsNote}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {fonts.map((f, i) => (
                <li key={f.name} data-enter style={{ "--i": 9 + i } as CSSProperties}>
                  <PitBoard title={`F${i + 1}`} meta="OFL 1.1" className="h-full">
                    <div className="flex flex-col gap-3 p-5">
                      <p className="headline text-2xl leading-none">{f.name}</p>
                      <p className="text-sm text-muted">
                        {t.by} <span className="text-fg">{f.author}</span>
                      </p>
                      <div className="label flex gap-4 text-[11px]">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className={link}>
                          {t.source} ↗
                        </a>
                        <a href={f.file} className={link}>
                          {t.licence}
                        </a>
                      </div>
                    </div>
                  </PitBoard>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="photo"
            data-enter
            className="flex flex-col gap-2 border-t border-line pt-6"
            style={{ "--i": 13 } as CSSProperties}
          >
            <h2 id="photo" className="label text-xs text-fg">
              {t.photoTitle}
            </h2>
            <p className="text-[17px] text-fg/90">{t.photo}</p>
          </section>
        </Reveal>
      </ScreenBlock>
    </>
  );
}
