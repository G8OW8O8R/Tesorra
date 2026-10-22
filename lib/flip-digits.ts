/** How long a digit takes to flip, and in how many pixel rows the mask moves. */
const FLIP_MS = 120;
const FLIP_STEPS = 4;

const NEW: Keyframe[] = [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }];
const OLD: Keyframe[] = [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(100% 0 0 0)" }];

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Writes `text` into `node` one `.flip` cell per character. A digit that changes jumps like a
 * timing screen: the new one comes in from the top under a stepped mask while the old one goes,
 * in 120 ms. Straight DOM, no React; a cell already mid-flip just takes the newer digit.
 */
export function writeDigits(node: HTMLElement | null, text: string) {
  if (!node) return;
  const chars = Array.from(text);
  const cells = node.children as HTMLCollectionOf<HTMLElement>;
  if (cells.length !== chars.length || node.dataset.flip === undefined) {
    // First write or a different length: lay out fresh cells, nothing to flip from.
    node.dataset.flip = "";
    node.replaceChildren(
      ...chars.map((ch) => {
        const cell = document.createElement("span");
        cell.className = "flip";
        cell.textContent = ch;
        return cell;
      }),
    );
    return;
  }
  const still = reduced();
  chars.forEach((ch, i) => {
    const cell = cells[i];
    const before = cell.textContent ?? "";
    if (before === ch) return;
    cell.textContent = ch;
    if (still || !/\d/.test(ch) || cell.getAnimations().length) return;
    cell.dataset.prev = before;
    const timing = { duration: FLIP_MS, easing: `steps(${FLIP_STEPS}, end)` };
    cell.animate(NEW, timing);
    cell.animate(OLD, { ...timing, pseudoElement: "::after" });
  });
}
