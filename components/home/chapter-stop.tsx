import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Picture } from "@/components/ui/picture";
import type { ImageKey } from "@/lib/images";

type Print = {
  image: ImageKey;
  face: ImageKey;
  alt: string;
  faceAlt: string;
  tilt: number;
  /** The driver's line on the print's bottom margin, signed in mono. */
  quote?: { text: string; by: string };
};

/**
 * What a chapter shows at its stop, straight over the scene with no card: bottom left a huge
 * outlined number with the name over it, one mono data line, one sentence and a link; on the right
 * a reportage print with the driver's quote (or `aside`). The page turns it on with `data-on` (and
 * lifts `inert`); the number draws itself, the letters rise out of a mask one after another and the
 * print slides in.
 */
export function ChapterStop({
  id,
  label,
  number,
  name,
  data,
  line,
  link,
  print,
  aside,
  children,
}: {
  id: string;
  label: string;
  number: string;
  name: string;
  data?: ReactNode;
  line?: string;
  link?: { href: string; label: string };
  print?: Print;
  aside?: ReactNode;
  /** Shown under the name in place of the data line (the live countdown). */
  children?: ReactNode;
}) {
  // Letters are numbered across the words for the stagger.
  const words = name.split(" ").map((word, w, all) => ({ word, from: all.slice(0, w).join("").length }));
  return (
    <section
      data-stop={id}
      aria-label={label}
      inert
      className="stop pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col justify-end px-4 pb-[calc(var(--dock-h)+32px)] md:inset-0 md:block md:p-0"
      style={{ "--stop": `var(--chapter-${id})` } as CSSProperties}
    >
      <div className="pointer-events-auto md:absolute md:bottom-[calc(var(--dock-h)+32px)] md:left-6 md:max-w-[58vw]">
        <div className="relative">
          <svg aria-hidden viewBox="0 12 150 78" className="stop-number block h-[16svh] w-auto overflow-visible md:h-[28vh]">
            <text
              x="2"
              y="86"
              fontSize="100"
              className="headline"
              fill="none"
              stroke="var(--stop)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            >
              {number}
            </text>
          </svg>
          <h2
            aria-label={name}
            className="headline absolute bottom-[6%] left-[0.06em] w-max max-w-[calc(100vw-2rem)] text-[clamp(2.4rem,7vw,9rem)] leading-[0.86] text-fg md:max-w-[58vw]"
          >
            {words.map(({ word, from }, w) => (
              <span key={w}>
                <span aria-hidden className="inline-block whitespace-nowrap">
                  {Array.from(word).map((ch, i) => (
                    <span key={i} className="stop-mask">
                      <span className="stop-letter" style={{ "--i": from + i } as CSSProperties}>
                        {ch}
                      </span>
                    </span>
                  ))}
                </span>
                {w < words.length - 1 ? " " : null}
              </span>
            ))}
          </h2>
        </div>
        {children ? (
          <div className="stop-line" style={{ "--i": 0 } as CSSProperties}>
            {children}
          </div>
        ) : null}
        {data ? (
          <p className="stop-line label mt-3 text-[11px] text-fg sm:text-xs" style={{ "--i": 0 } as CSSProperties}>
            {data}
          </p>
        ) : null}
        {line ? (
          <p className="stop-line mt-2 max-w-[34rem] text-sm text-fg/85 sm:text-base" style={{ "--i": 1 } as CSSProperties}>
            {line}
          </p>
        ) : null}
        {link ? (
          <Link
            href={link.href}
            className="stop-line label mt-3 inline-block text-[11px] text-fg underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:text-accent hover:decoration-current"
            style={{ "--i": 2 } as CSSProperties}
          >
            {link.label}
          </Link>
        ) : null}
      </div>

      {print ? (
        <div className="stop-print pointer-events-auto mt-4 md:absolute md:top-1/2 md:right-[6vw] md:mt-0 md:w-[22vw]">
          {/* The print turns as a whole, quote and all; on phones it lies straight. */}
          <figure
            className="group bg-[#f2ece1] p-1.5 md:rotate-(--tilt) md:p-[0.45vw]"
            style={{ "--tilt": `${print.tilt}deg` } as CSSProperties}
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-bg">
              <Picture
                image={print.image}
                alt={print.alt}
                sizes="(min-width: 768px) 22vw, 100vw"
                data-preload
                className="size-full object-cover"
              />
              <Picture
                image={print.face}
                alt={print.faceAlt}
                sizes="(min-width: 768px) 22vw, 100vw"
                data-preload
                className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-(--dur-base) ease-standard group-hover:opacity-100"
              />
            </div>
            {print.quote ? (
              // Written on the wide bottom margin of the print, like a polaroid.
              <figcaption className="pt-4 pb-3 md:pt-[1.35vw] md:pb-[1.1vw]">
                <blockquote className="quote line-clamp-2 text-[max(14px,1.05vw)] leading-snug text-[#1d1b22]">
                  {print.quote.text}
                </blockquote>
                <p className="label mt-1.5 text-[10px] text-[#6b6670] md:text-[max(10px,0.6vw)]">{print.quote.by}</p>
              </figcaption>
            ) : null}
          </figure>
        </div>
      ) : null}
      {aside ? (
        <div className="stop-print pointer-events-auto mt-4 md:absolute md:top-1/2 md:right-6 md:mt-0 md:w-[min(32rem,28vw)]">
          {aside}
        </div>
      ) : null}
    </section>
  );
}
