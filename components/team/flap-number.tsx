"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const SVG = "http://www.w3.org/2000/svg";

/** How long a column takes to roll (ms): a base plus a little a digit it passes; columns trail. */
const ROLL = { base: 380, step: 45, trail: 90 } as const;

function glyph(digit: string) {
  const svg = document.createElementNS(SVG, "svg");
  const text = document.createElementNS(SVG, "text");
  text.setAttribute("x", "50%");
  text.setAttribute("y", "0.86em");
  text.setAttribute("text-anchor", "middle");
  text.textContent = digit;
  svg.append(text);
  return svg;
}

/**
 * The huge outlined number. Its outlines draw themselves on entry; when the value changes each
 * column rolls forward through the digits in between like a timing board and stops on the new
 * one. Rolled straight in the DOM; React only renders the first value.
 */
export function FlapNumber({ value, className = "", style }: { value: string; className?: string; style?: CSSProperties }) {
  const [first] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);

  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    if (!el || from === value) return;
    shown.current = value;
    // The entry draw belongs to the first number only.
    el.removeAttribute("data-draw");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const strips = el.querySelectorAll<HTMLElement>(".flap-strip");
    Array.from(value).forEach((digit, i) => {
      const strip = strips[i];
      if (!strip) return;
      strip.getAnimations().forEach((a) => a.cancel());
      const start = Number(from[i] ?? digit);
      const end = Number(digit);
      const steps = [start];
      for (let d = start; d !== end; ) {
        d = (d + 1) % 10;
        steps.push(d);
      }
      if (still || steps.length === 1) {
        strip.replaceChildren(glyph(digit));
        return;
      }
      strip.replaceChildren(...steps.map((d) => glyph(String(d))));
      const roll = strip.animate([{ translate: "0 0" }, { translate: `0 -${steps.length - 1}em` }], {
        duration: ROLL.base + steps.length * ROLL.step,
        delay: i * ROLL.trail,
        easing: "cubic-bezier(0.3, 0, 0.1, 1)",
        fill: "forwards",
      });
      roll.onfinish = () => {
        strip.replaceChildren(glyph(digit));
        roll.cancel();
      };
    });
  }, [value]);

  return (
    <span ref={ref} aria-hidden data-draw="" className={`flap ${className}`} style={style}>
      {Array.from(first).map((digit, i) => (
        <span key={i} className="flap-cell" style={{ "--i": i } as CSSProperties}>
          <span className="flap-strip">
            <svg>
              <text x="50%" y="0.86em" textAnchor="middle">
                {digit}
              </text>
            </svg>
          </span>
        </span>
      ))}
    </span>
  );
}
