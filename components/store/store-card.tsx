import Link from "next/link";
import type { CSSProperties } from "react";
import { PitBoard } from "@/components/ui/pit-board";
import { Picture } from "@/components/ui/picture";
import type { Product } from "@/content/store";
import { formatPrice } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { images } from "@/lib/images";
import type { Messages } from "@/messages";

type StoreText = Messages["store"];

/**
 * A product on a pit board: board strip with its place and part of the store, the cut-out, name
 * and price. On hover a second shot (the back, or the helmet worn at an event) slides in as if the
 * product turned. Rides in with the cards around it (`data-enter`, `--i`).
 */
export function StoreCard({ lang, t, product, index }: { lang: Locale; t: StoreText; product: Product; index: number }) {
  const [front, back] = product.shots;
  const name = t.products[product.slug as keyof StoreText["products"]].name;
  const fit = (shot: (typeof product.shots)[number]) => (images[shot].alpha ? "object-contain p-[8%]" : "object-cover");
  const tag = product.limited ? t.limited : product.wornBy.length === 1 ? `#${product.wornBy[0]}` : "";

  return (
    <div data-enter style={{ "--i": index % 8 } as CSSProperties}>
      <PitBoard
        interactive
        title={`P${String(index + 1).padStart(2, "0")}  ${t.categories[product.category]}`}
        meta={tag || undefined}
        className="group h-full"
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          <Picture
            image={front}
            alt=""
            sizes="(min-width: 1024px) 25vw, 50vw"
            className={`absolute inset-0 size-full transition-[translate,opacity,scale] duration-(--dur-slow) ease-out ${fit(front)} ${
              back ? "group-hover:-translate-x-[6%] group-hover:opacity-0" : "group-hover:scale-[1.04]"
            }`}
          />
          {back ? (
            <Picture
              image={back}
              alt=""
              sizes="(min-width: 1024px) 25vw, 50vw"
              className={`absolute inset-0 size-full translate-x-[6%] opacity-0 transition-[translate,opacity] duration-(--dur-slow) ease-out group-hover:translate-x-0 group-hover:opacity-100 ${fit(back)}`}
            />
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-line px-4 pt-3 pb-4 md:px-5">
          <h3 className="headline min-w-0 text-base leading-tight md:text-lg">
            <Link
              href={`/${lang}/store/${product.slug}`}
              className="outline-none after:absolute after:inset-0 focus-visible:text-accent"
            >
              {name}
            </Link>
          </h3>
          <p className="label shrink-0 text-xs text-fg">{formatPrice(product.priceCents, lang)}</p>
        </div>
      </PitBoard>
    </div>
  );
}
