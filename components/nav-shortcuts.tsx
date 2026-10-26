"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";
import { type HomeStop, useRideHome } from "./use-ride-home";

/** A key that opens a page, or rides to a stop of the home page. */
export type Shortcut = { key: string; href: string } | { key: string; stop: HomeStop };

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Single-key navigation shortcuts; ignored while typing or with modifiers held. */
export function NavShortcuts({ lang, shortcuts }: { lang: Locale; shortcuts: Shortcut[] }) {
  const router = useRouter();
  const rideHome = useRideHome(lang);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      const match = shortcuts.find((s) => s.key === event.key.toLowerCase());
      if (!match) return;
      event.preventDefault();
      if ("stop" in match) rideHome(match.stop);
      else router.push(match.href);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, rideHome, shortcuts]);

  return null;
}
