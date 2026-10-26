import type { CSSProperties } from "react";
import type { Driver } from "@/content/team";

/** Each driver's signature as one pen stroke (with lifts), in a 420 × 130 box. */
const SIGNATURES: Record<Driver["key"], string> = {
  // K. Wierzbicki: tall K, a dot, a long W and a run of small loops, underlined back to the left.
  kuba:
    "M18 104C34 76 46 44 56 16C50 48 44 78 40 104M40 70C58 54 74 40 92 30C74 50 62 62 54 72C70 82 84 94 102 104M117 97a2.5 2.5 0 1 0 1 0M138 40C142 70 146 92 152 100C160 80 166 62 172 52C176 70 180 90 186 98C196 76 204 54 210 36C214 60 216 84 224 92C232 76 236 66 242 62C246 76 248 88 254 90C262 72 266 52 270 30C272 56 274 80 280 92C290 80 296 70 300 66C304 78 306 88 314 88C322 80 328 64 334 50C336 70 338 86 346 90C356 84 364 72 372 60M120 116C200 108 300 104 404 96C380 104 352 112 330 118",
  // E. Moreau: a looped E, a dot, a sharp M and rounded letters running to a flick.
  elena:
    "M40 30C26 30 18 44 30 56C14 60 10 84 28 92C42 98 56 90 64 80M77 93a2.5 2.5 0 1 0 1 0M100 98C104 74 108 50 114 30C122 56 128 76 132 86C140 64 148 44 158 28C158 56 160 80 166 96C176 84 186 70 196 66C204 64 210 74 204 84C196 94 182 90 186 78C194 70 208 74 218 80C224 70 230 64 238 66C232 72 230 82 236 88C246 86 252 74 260 70C272 66 276 80 266 86C258 92 252 84 262 78C272 74 282 82 290 86C300 80 306 70 314 66C310 78 312 88 320 88C330 84 334 72 340 64C338 76 340 86 348 88C360 86 372 76 384 64M96 112C180 104 280 102 396 110",
  // T. Aranda: a crossbar T with a hooked stem, a dot, a pointed A and a flat, fast tail.
  tomas:
    "M14 34C80 26 140 22 196 24M96 26C90 54 82 82 70 110C66 118 58 120 54 112M105 99a2.5 2.5 0 1 0 1 0M126 100C140 76 156 50 170 32C176 58 180 82 186 100M146 72C162 68 178 66 194 68C200 70 204 78 210 84C214 74 220 68 230 66C228 74 230 84 236 88C244 88 250 76 258 68C256 78 256 88 264 90C272 84 276 74 282 68C282 76 282 86 290 90C298 86 304 76 310 70C318 66 326 74 320 84C312 92 300 86 306 76C314 66 326 54 336 34C334 58 334 80 340 94C350 90 360 82 368 72C366 80 368 90 376 92C388 90 398 80 408 70",
};

/**
 * A driver's signature drawn as one pen stroke when it gets `data-on` (the parent sets it, or
 * `on` does). `weight` is the stroke in box units, so a huge signature can stay a thin line.
 */
export function Signature({
  driver,
  label,
  on = false,
  weight = 2.2,
  className = "",
  style,
}: {
  driver: Driver["key"];
  /** Without a label the signature is decoration and hidden from assistive technology. */
  label?: string;
  on?: boolean;
  weight?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 420 130"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-on={on ? "" : undefined}
      className={`signature overflow-visible ${className}`}
      style={style}
    >
      <path d={SIGNATURES[driver]} pathLength={1} strokeWidth={weight} />
    </svg>
  );
}
