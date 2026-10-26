"use client";

import { type CSSProperties, useEffect } from "react";
import { INTRO_KEY } from "@/lib/intro";
import { intro } from "@/lib/motion-tokens";

const END = 5 * intro.step + intro.hold;

/**
 * Intro: five start lights come on one by one, all go out, and the page moves off. Once shown it
 * is marked as seen for the session, and coming back to the page skips it.
 */
export function StartLights() {
  useEffect(() => {
    const shown = performance.now();
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {}
    return () => {
      // Leaving the page, not the instant remount of development's strict mode.
      if (performance.now() - shown > 50) document.documentElement.dataset.intro = "skip";
    };
  }, []);

  return (
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
  );
}

/** How long the hero waits for the lights (when they play). */
export const INTRO_DELAY = END;
