import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Reveal } from "@/components/ui/reveal";
import { ScreenBlock } from "@/components/ui/screen-block";
import { hasLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getMessages } from "@/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]/legal">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getMessages(lang).legal;
  return pageMetadata(lang, "/legal", { title: `${t.title} — Tesorra Racing`, description: t.description });
}

export default async function LegalPage({ params }: PageProps<"/[lang]/legal">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).legal;

  return (
    <>
      <SmoothScroll />
      <ScreenBlock className="pt-[14svh]">
        <Reveal className="mx-auto flex w-full max-w-3xl flex-col gap-12">
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
          </header>
          <ol className="flex flex-col">
            {t.sections.map((s, i) => (
              <li
                key={s.title}
                data-enter
                className="grid gap-2 border-t border-line py-6 md:grid-cols-[4rem_1fr]"
                style={{ "--i": 2 + i } as CSSProperties}
              >
                <span className="label text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex flex-col gap-2">
                  <h2 className="headline text-2xl leading-none">{s.title}</h2>
                  <p className="text-[17px] leading-relaxed text-fg/90">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            href={`/${lang}/credits`}
            data-enter
            className="label self-start text-[11px] text-muted underline decoration-fg/30 underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-accent"
            style={{ "--i": 8 } as CSSProperties}
          >
            {t.creditsLink} →
          </Link>
        </Reveal>
      </ScreenBlock>
    </>
  );
}
