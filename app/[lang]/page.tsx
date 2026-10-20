import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n";
import { getMessages } from "@/messages";

// Placeholder chapter stops so the page scrolls; the scene replaces them.
const chapters = [
  { id: "drift", number: "01", name: "DRIFT" },
  { id: "formula", number: "02", name: "FORMULA" },
  { id: "moto", number: "03", name: "MOTO" },
  { id: "store", number: "04", name: "STORE" },
  { id: "live", number: "05", name: "LIVE" },
];

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getMessages(lang).home;

  return (
    <>
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-24 sm:px-8">
        <h1 className="font-serif text-4xl leading-[1.05] font-normal tracking-tight sm:text-6xl">
          {t.heading.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">{t.sub}</p>
      </section>
      {chapters.map((c) => (
        <section
          key={c.id}
          id={c.id}
          className="flex min-h-[120svh] scroll-mt-12 items-start border-t border-line px-4 py-10 sm:px-6"
        >
          <p className="label text-[11px] text-muted">
            {c.number} — <span style={{ color: `var(--chapter-${c.id})` }}>{c.name}</span>
          </p>
        </section>
      ))}
    </>
  );
}
