"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Mono label above the title, e.g. `BOX · 2`. */
  eyebrow?: string;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
};

/** Modal sheet: slides in from the right on desktop, rises from the bottom on phones. */
export function Drawer({ open, onClose, title, eyebrow, closeLabel, footer, children }: DrawerProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const outside = Array.from(document.body.children).filter((el) => el !== root && !el.contains(root));
    outside.forEach((el) => el.setAttribute("inert", ""));
    document.documentElement.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      outside.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      returnTo?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div ref={rootRef} className={`fixed inset-0 z-50 transition-[visibility] ${open ? "visible" : "invisible delay-(--dur-slow)"}`}>
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-bg/70 transition-opacity duration-(--dur-base) ease-standard ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
        tabIndex={-1}
        className={`panel absolute inset-x-0 bottom-0 flex max-h-[85svh] flex-col border-b-0 bg-bg/90 outline-none transition-[translate] duration-(--dur-slow) ease-out sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(440px,100%)] sm:border-y-0 sm:border-r-0 ${
          open
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-x-full sm:translate-y-0"
        }`}
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 bg-line sm:hidden" />
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-4 sm:px-6 sm:pt-5">
          <div>
            {eyebrow && <p className="label text-[11px] text-muted">{eyebrow}</p>}
            <h2 id={titleId} className="mt-1 font-serif text-2xl leading-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="label -mr-2 inline-flex h-8 items-center px-2 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:text-accent"
          >
            {closeLabel}
          </button>
        </header>
        <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer && <div className="border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
