"use client";

import { useEffect, useRef } from "react";
import { boxCount, useBox, useBoxUi } from "@/lib/cart";
import { writeDigits } from "@/lib/flip-digits";
import type { Messages } from "@/messages";

/**
 * BOX in the bar: the box's item count, flipping like a timing screen when it changes; opens the
 * box. It also reads the stored box back once the page is hydrated.
 */
export function BoxButton({ t }: { t: Messages["nav"] }) {
  const count = useBox((s) => boxCount(s.lines));
  const setOpen = useBoxUi((s) => s.setOpen);
  const digits = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    void useBox.persist.rehydrate();
  }, []);

  useEffect(() => {
    writeDigits(digits.current, String(count));
  }, [count]);

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${t.box} ${count} · ${t.boxItems}`}
      onClick={() => setOpen(true)}
      className="label inline-flex h-8 items-center gap-1.5 px-2 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
    >
      {t.box}
      <span ref={digits} aria-hidden className={`tabular-nums ${count > 0 ? "text-accent" : "text-muted"}`}>
        0
      </span>
    </button>
  );
}
