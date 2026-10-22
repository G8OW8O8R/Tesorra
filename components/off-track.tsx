import Link from "next/link";
import type { Messages } from "@/messages";

export function OffTrack({ t, homeHref }: { t: Messages["notFound"]; homeHref: string }) {
  return (
    <section className="flex w-full flex-1 flex-col justify-center px-4 py-24 sm:px-6">
      <p className="label text-[11px] text-muted">404</p>
      <h1 className="headline mt-4 text-6xl leading-[0.92] sm:text-8xl">
        {t.heading}
      </h1>
      <p className="mt-6 max-w-md text-muted">{t.line}</p>
      <Link
        href={homeHref}
        className="label mt-10 self-start border-b border-line pb-1 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:border-accent hover:text-accent"
      >
        {t.back}
      </Link>
    </section>
  );
}
