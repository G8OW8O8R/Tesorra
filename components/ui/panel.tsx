import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

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
  /** Extra content above the link (e.g. product thumbnails). */
  children?: ReactNode;
  className?: string;
};

const enter = (i: number) => ({ "data-enter": "", style: { "--i": i } as CSSProperties });

/**
 * Panel shown at a chapter stop: label, heading, two lines, data line, link. Inside a `.ride-in`
 * container each line rides in after the one before it.
 */
export function ChapterPanel({ number, name, color, heading, body, data, link, children, className = "" }: ChapterPanelProps) {
  return (
    <Panel className={`max-w-full min-w-0 ${className}`}>
      <p className="label text-[11px] text-muted" {...enter(0)}>
        {number} — <span style={{ color }}>{name}</span>
      </p>
      <h2 className="headline mt-4 text-[2.5rem] leading-[0.95] break-words sm:text-6xl lg:text-7xl" {...enter(1)}>
        {heading}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base" {...enter(2)}>
        {body}
      </p>
      <p className="label mt-5 border-t border-line pt-3 text-[11px] text-fg" {...enter(3)}>
        {data}
      </p>
      {children ? <div {...enter(4)}>{children}</div> : null}
      <div {...enter(children ? 5 : 4)}>
        <Link
          href={link.href}
          className="label mt-4 inline-block border-b border-line pb-1 text-[11px] text-fg transition-colors duration-(--dur-fast) ease-standard hover:border-accent hover:text-accent"
        >
          {link.label}
        </Link>
      </div>
    </Panel>
  );
}
