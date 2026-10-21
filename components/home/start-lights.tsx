import type { CSSProperties } from "react";
import { intro } from "@/lib/motion-tokens";

const KEY = "tesorra:intro";
const END = 5 * intro.step + intro.hold;

// Runs while the HTML is parsed, before first paint: the lights only play on the first visit of the
// session and never under reduced motion.
const SKIP = `try{var d=document.documentElement;if(sessionStorage.getItem("${KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.intro="skip";else sessionStorage.setItem("${KEY}","1")}catch(e){}`;

/** Intro: five start lights come on one by one, all go out, and the page moves off. */
export function StartLights() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKIP }} />
      <div
        aria-hidden
        className="intro pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-bg"
        style={
          {
            "--intro-step": `${intro.step}ms`,
            "--intro-end": `${END}ms`,
            "--intro-out": `${intro.out}ms`,
          } as CSSProperties
        }
      >
        <div className="flex gap-3 sm:gap-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="relative size-7 rounded-full border border-fg/15 bg-fg/[0.04] sm:size-11">
              <span
                className="intro-light absolute inset-0 rounded-full bg-amber shadow-[0_0_28px_rgb(227_160_79/0.55)]"
                style={{ "--i": i } as CSSProperties}
              />
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

/** How long the hero waits for the lights (when they play). */
export const INTRO_DELAY = END;
