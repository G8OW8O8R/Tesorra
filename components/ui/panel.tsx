import Link from "next/link";
import type { ComponentProps } from "react";

/** Blurred surface over the scene. */
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`panel p-5 sm:p-6 ${className}`} {...props} />;
}

type ChapterPanelProps = {
  number: string;
  name: string;
  /** CSS colour of the chapter, e.g. `var(--chapter-drift)`. */
  color: string;
  heading: string;
  body: string;
  data: string;
  link: { href: string; label: string };
  className?: string;
};

/** Panel shown at a chapter stop: label, heading, two lines, data line, link. */
export function ChapterPanel({ number, name, color, heading, body, data, link, className = "" }: ChapterPanelProps) {
  return (
    <Panel className={`max-w-md ${className}`}>
      <p className="label text-[11px] text-muted">
        {number} — <span style={{ color }}>{name}</span>
      </p>
      <h2 className="mt-4 font-serif text-3xl leading-[1.05] tracking-tight sm:text-4xl">{heading}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{body}</p>
      <p className="label mt-5 border-t border-line pt-3 text-[11px] text-fg">{data}</p>
      <Link
        href={link.href}
        className="label mt-4 inline-block border-b border-line pb-1 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:border-accent hover:text-accent"
      >
        {link.label}
      </Link>
    </Panel>
  );
}
