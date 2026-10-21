import Link from "next/link";
import type { MouseEvent } from "react";
import { Claw } from "@/components/brand/claw";

export type ChapterEntry = { id: string; number: string; name: string; href: string };

/**
 * Chapter list: the active stop is bright with a claw marker in its colour, the rest stay dim.
 * With `onSelect` a click rides there instead of jumping (the link still works without script).
 * The look follows `aria-current` alone, so a page can move it in the DOM (`data-chapter`)
 * without re-rendering.
 */
export function ChapterIndex({
  chapters,
  active,
  label,
  onSelect,
  className = "",
}: {
  chapters: readonly ChapterEntry[];
  active: string;
  label: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  // Only built when there is a handler, so the list still renders on the server.
  const select = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onSelect(id);
  };

  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col gap-1">
        {chapters.map((c) => {
          const current = c.id === active;
          return (
            <li key={c.id}>
              <Link
                href={c.href}
                scroll={!onSelect}
                onClick={onSelect ? select(c.id) : undefined}
                aria-current={current ? "location" : undefined}
                data-chapter={c.id}
                className="label group flex h-7 items-center gap-3 text-[11px] text-muted transition-colors duration-(--dur-base) ease-standard hover:text-fg aria-[current=location]:text-fg"
              >
                <span aria-hidden className="relative flex h-4 w-3 items-center justify-center">
                  <Claw
                    variant="marker"
                    className="absolute inset-0 h-4 w-3 scale-50 opacity-0 transition-[opacity,scale] duration-(--dur-base) ease-out group-aria-[current=location]:scale-100 group-aria-[current=location]:opacity-100"
                    style={{ color: `var(--chapter-${c.id})` }}
                  />
                  <span className="h-px w-2 bg-line transition-opacity duration-(--dur-base) ease-standard group-hover:bg-muted group-aria-[current=location]:opacity-0" />
                </span>
                <span className="tabular-nums">{c.number}</span>
                <span>{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
