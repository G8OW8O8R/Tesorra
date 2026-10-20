"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Messages } from "@/messages";

const noop = () => () => {};

/** MENU toggle and the full-screen sheet behind it. The sheet sits under the bar. */
export function SiteMenu({ t }: { t: Messages["nav"] }) {
  const pathname = usePathname();
  // Remember where the menu was opened; any navigation closes it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const outside = [document.getElementById("main"), document.getElementById("footer")];
    outside.forEach((el) => el?.setAttribute("inert", ""));
    document.documentElement.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenedAt(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      outside.forEach((el) => el?.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpenedAt(open ? null : pathname)}
        className="label inline-flex h-8 items-center px-2 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
      >
        {open ? t.close : t.menu}
      </button>
      {mounted &&
        createPortal(
          <div
            id="site-menu"
            role="region"
            aria-label={t.menuLabel}
            aria-hidden={!open}
            className={`fixed inset-0 z-30 bg-bg transition-[translate,opacity,visibility] duration-(--dur-slow) ease-out motion-reduce:translate-y-0 ${
              open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-full motion-reduce:opacity-0"
            }`}
          />,
          document.body,
        )}
    </>
  );
}
