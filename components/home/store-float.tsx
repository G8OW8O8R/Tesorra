import Link from "next/link";
import type { CSSProperties } from "react";
import { Picture } from "@/components/ui/picture";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { ImageKey } from "@/lib/images";
import type { Messages } from "@/messages";

/**
 * Products floating over the road at the store stop, in the order of `store.products` in the
 * scene tuning. `width` is the size at the reference depth (vw; phones take more of the screen).
 */
export const FLOATING_PRODUCTS = [
  { slug: "helmet-21", image: "store/helmet-21", priceCents: 12900, width: 15 },
  { slug: "fuel-citrus", image: "store/can-citrus", priceCents: 350, width: 8 },
  { slug: "drift-gloves", image: "store/gloves", priceCents: 6900, width: 13 },
  { slug: "team-cap", image: "store/cap", priceCents: 3500, width: 13 },
  { slug: "night-hoodie", image: "store/hoodie-front", priceCents: 8900, width: 16 },
  { slug: "pit-jacket", image: "store/jacket", priceCents: 14900, width: 15 },
] as const satisfies readonly {
  slug: keyof Messages["home"]["products"];
  image: ImageKey;
  priceCents: number;
  width: number;
}[];

/** Threshold of the dissolve mask for a form of 0 (nothing shown) … 1 (all of it). */
export function dissolveIntercept(form: number) {
  return -8 * (0.8 - 0.62 * form);
}

/**
 * The floating products. The page moves each `[data-product]` from the scene's frame data
 * (position, size, form) and drives its dissolve mask: noise thresholded by the form, so a product
 * comes out of the dust and goes back into it grain by grain.
 */
export function StoreFloat({ lang, t }: { lang: Locale; t: Messages["home"]["products"] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <svg width="0" height="0" className="absolute">
        {FLOATING_PRODUCTS.map((p, i) => (
          <filter key={p.slug} id={`dissolve-${i}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed={i + 3} result="noise" />
            <feComponentTransfer in="noise" result="mask">
              <feFuncA type="linear" slope="8" intercept={dissolveIntercept(0)} />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="mask" operator="in" />
          </filter>
        ))}
      </svg>
      {FLOATING_PRODUCTS.map((p, i) => (
        <Link
          key={p.slug}
          href={`/${lang}/store/${p.slug}`}
          tabIndex={-1}
          data-product={i}
          className="group pointer-events-auto absolute top-0 left-0 block w-[calc(var(--w)*1vw)] will-change-transform max-md:w-[calc(var(--w)*1.8vw)]"
          style={{ "--w": p.width, visibility: "hidden" } as CSSProperties}
        >
          <span className="block transition-[scale] duration-(--dur-base) ease-out group-hover:scale-[1.06]">
            <Picture image={p.image} alt="" sizes={`${p.width * 2}vw`} className="h-auto w-full" data-preload />
          </span>
          <span className="label absolute top-full left-1/2 mt-1 -translate-x-1/2 text-center text-[11px] whitespace-nowrap text-fg opacity-0 transition-opacity duration-(--dur-fast) ease-standard group-hover:opacity-100">
            {t[p.slug].name} · {formatPrice(p.priceCents, lang)}
          </span>
        </Link>
      ))}
    </div>
  );
}
