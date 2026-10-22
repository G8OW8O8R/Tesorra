import Image from "next/image";
import Link from "next/link";
import { PitBoard } from "./pit-board";

export type ProductCardProps = {
  href: string;
  name: string;
  category: string;
  price: string;
  /** Board strip, e.g. `["#21", "LAP 12"]`. */
  board: readonly [string, string];
  image?: { src: string; alt: string };
  sizes?: string;
};

/** Store card on a pit board: cut-out shot, serif name, mono price. */
export function ProductCard({ href, name, category, price, board, image, sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" }: ProductCardProps) {
  return (
    <PitBoard title={board[0]} meta={board[1]} interactive className="group">
      <div className="relative aspect-[4/5] overflow-hidden">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes={sizes}
            className="object-contain p-6 transition-transform duration-(--dur-slow) ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-6 transition-transform duration-(--dur-slow) ease-out group-hover:scale-[1.03]"
            style={{
              backgroundImage: "radial-gradient(rgb(227 160 79 / 0.35) 0.8px, transparent 1.2px)",
              backgroundSize: "9px 9px",
              maskImage: "radial-gradient(closest-side, #000 40%, transparent)",
            }}
          />
        )}
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-line px-5 pt-4 pb-5">
        <div className="min-w-0">
          <p className="label text-[10px] text-muted">{category}</p>
          <h3 className="headline mt-1 truncate text-xl leading-tight">
            <Link href={href} className="outline-none after:absolute after:inset-0">
              {name}
            </Link>
          </h3>
        </div>
        <p className="label shrink-0 text-xs text-fg">{price}</p>
      </div>
    </PitBoard>
  );
}
