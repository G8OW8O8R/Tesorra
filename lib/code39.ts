/**
 * Code 39 barcodes: each character is nine elements (bar, space, bar … bar), three of them wide.
 * `n` narrow, `w` wide. Enough of the set for order numbers: digits, capitals, dash and the start
 * and stop character `*`.
 */
const PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  "*": "nwnnwnwnn",
};

/** A wide element is this many narrow ones. */
export const WIDE = 3;

export type Bar = { x: number; width: number };

/**
 * The bars of `text` framed by start and stop characters, in narrow-element units, and the
 * total width. Characters outside the set are dropped.
 */
export function code39(text: string): { bars: Bar[]; width: number } {
  const chars = ["*", ...Array.from(text.toUpperCase()).filter((ch) => ch !== "*" && ch in PATTERNS), "*"];
  const bars: Bar[] = [];
  let x = 0;
  chars.forEach((ch, c) => {
    Array.from(PATTERNS[ch]).forEach((element, i) => {
      const width = element === "w" ? WIDE : 1;
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    });
    // Narrow gap between characters.
    if (c < chars.length - 1) x += 1;
  });
  return { bars, width: x };
}
