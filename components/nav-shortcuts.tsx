"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type Shortcut = { key: string; href: string };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Single-key navigation shortcuts; ignored while typing or with modifiers held. */
export function NavShortcuts({ shortcuts }: { shortcuts: Shortcut[] }) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      const match = shortcuts.find((s) => s.key === event.key.toLowerCase());
      if (!match) return;
      event.preventDefault();
      router.push(match.href);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, shortcuts]);

  return null;
}
