import Link from "next/link";

export type ChapterEntry = { id: string; number: string; name: string; href: string };

/** Chapter list: the active stop is bright with a marker in its colour, the rest stay dim. */
export function ChapterIndex({
  chapters,
  active,
  label,
  className = "",
}: {
  chapters: readonly ChapterEntry[];
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col gap-1">
        {chapters.map((c) => {
          const current = c.id === active;
          return (
            <li key={c.id}>
              <Link
                href={c.href}
                aria-current={current ? "location" : undefined}
                className={`label group flex h-7 items-center gap-3 text-[11px] transition-colors duration-(--dur-base) ease-standard ${
                  current ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-px origin-left transition-[scale,background-color] duration-(--dur-base) ease-out ${
                    current ? "w-6 scale-x-100" : "w-6 scale-x-[0.34] bg-line group-hover:scale-x-50 group-hover:bg-muted"
                  }`}
                  style={current ? { backgroundColor: `var(--chapter-${c.id})` } : undefined}
                />
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
