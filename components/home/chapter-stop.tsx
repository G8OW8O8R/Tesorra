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
 *
 * Phones put it all under the scene: the number with the name beside it (the page shrinks the name
 * to fit, `data-fit`), the data line and the link; no sentence. The print lies there folded small
 * and opens over the scene with its quote on a tap.
 */
/** Written on the wide bottom margin of the print, like a polaroid. */
function PrintQuote({ quote }: { quote: NonNullable<Print["quote"]> }) {
  return (
    <figcaption className="pt-3 pb-2 md:pt-[1.35vw] md:pb-[1.1vw]">
      <blockquote className="quote line-clamp-3 text-[15px] leading-snug text-[#1d1b22] md:line-clamp-2 md:text-[max(14px,1.05vw)]">
        {quote.text}
      </blockquote>
      <p className="label mt-1.5 text-[10px] text-[#6b6670] md:text-[max(10px,0.6vw)]">{quote.by}</p>
    </figcaption>
  );
}

/**
 * The print on phones: folded small beside the data line, it opens over the scene (60% of the
 * width, turned -2 degrees) with the quote on its margin; a tap anywhere folds it again.
 */
function FoldedPrint({ id, print }: { id: string; print: Print }) {
  const pop = `print-${id}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={pop}
        aria-label={print.alt}
        className="stop-line mt-3 w-[26vw] shrink-0 -rotate-2 bg-[#f2ece1] p-1 md:hidden"
        style={{ "--i": 1 } as CSSProperties}
      >
        <Picture image={print.image} alt="" sizes="26vw" className="aspect-[16/9] w-full object-cover" />
      </button>
      <div id={pop} popover="auto" className="print-pop md:hidden">
        <figure className="-rotate-2 bg-[#f2ece1] p-1.5">
          <Picture image={print.image} alt={print.alt} sizes="60vw" className="aspect-[16/9] w-full object-cover" />
          {print.quote ? <PrintQuote quote={print.quote} /> : null}
        </figure>
      </div>
    </>
  );
}

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
      className="stop pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col justify-end px-(--gutter) pb-[calc(var(--dock-h)+32px)] md:inset-0 md:block md:p-0"
      style={{ "--stop": `var(--chapter-${id})` } as CSSProperties}
    >
      <div className="pointer-events-auto md:absolute md:bottom-[calc(var(--dock-h)+32px)] md:left-6 md:max-w-[58vw]">
        <div className="flex items-end gap-[2vw] md:relative md:block">
          <svg aria-hidden viewBox="0 12 150 78" className="stop-number block h-[20vw] w-auto shrink-0 overflow-visible md:h-[28vh]">
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
            data-fit
            className="headline min-w-0 flex-1 pb-[1vw] text-[calc(11vw*var(--fit,1))] leading-[0.86] text-fg md:absolute md:bottom-[6%] md:left-[0.06em] md:w-max md:max-w-[58vw] md:flex-none md:pb-0 md:text-[clamp(2.4rem,7vw,9rem)]"
          >
            {words.map(({ word, from }, w) => (
              <span key={w}>
                <span aria-hidden data-word className="inline-block whitespace-nowrap">
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
        <div className="flex items-start gap-4 md:block">
          <div className="min-w-0 flex-1">
            {data ? (
              <p className="stop-line label mt-3 text-[11px] text-fg md:text-xs" style={{ "--i": 0 } as CSSProperties}>
                {data}
              </p>
            ) : null}
            {line ? (
              <p
                className="stop-line mt-2 hidden max-w-[34rem] text-base text-fg/85 md:block"
                style={{ "--i": 1 } as CSSProperties}
              >
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
          {print ? <FoldedPrint id={id} print={print} /> : null}
        </div>
      </div>

      {print ? (
        <div className="stop-print pointer-events-auto absolute top-1/2 right-[6vw] hidden w-[22vw] md:block">
          {/* The print turns as a whole, quote and all. */}
          <figure className="group rotate-(--tilt) bg-[#f2ece1] p-[0.45vw]" style={{ "--tilt": `${print.tilt}deg` } as CSSProperties}>
            <div className="relative aspect-[16/9] overflow-hidden bg-bg">
              <Picture image={print.image} alt={print.alt} sizes="22vw" data-preload className="size-full object-cover" />
              <Picture
                image={print.face}
                alt={print.faceAlt}
                sizes="22vw"
                data-preload
                className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-(--dur-base) ease-standard group-hover:opacity-100"
              />
            </div>
            {print.quote ? <PrintQuote quote={print.quote} /> : null}
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
