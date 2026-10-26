"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";
import { sceneTuning } from "@/lib/scene-tuning";

let current: Lenis | null = null;

/** The sub-page's smooth scroll, while one runs (none under reduced motion). */
export function getSmoothScroll() {
  return current;
}

/** Smooth wheel scrolling on sub-pages (touch scrolls natively), as on the home page. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, syncTouch: false, ...sceneTuning.scroll.lenis });
    current = lenis;
    return () => {
      lenis.destroy();
      if (current === lenis) current = null;
    };
  }, []);
  return null;
}
