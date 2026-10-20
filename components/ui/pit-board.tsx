import type { ComponentProps, ReactNode } from "react";

function Screw({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute grid size-[7px] place-items-center rounded-full border border-fg/25 bg-bg ${className}`}
    >
      <span className="h-px w-[5px] rotate-45 bg-fg/30" />
    </span>
  );
}

type PitBoardProps = Omit<ComponentProps<"div">, "title"> & {
  /** Left side of the board strip, e.g. `P1` or `#21`. */
  title: ReactNode;
  /** Right side of the board strip, e.g. `+0.000` or `LAP 12`. */
  meta?: ReactNode;
  /** Reacts to hover and focus within (for cards that are links). */
  interactive?: boolean;
};

/** Card shaped like a pit board: thin frame, corner screws and a mono strip on top. */
export function PitBoard({ title, meta, interactive = false, className = "", children, ...props }: PitBoardProps) {
  return (
    <div
      className={`relative flex flex-col border border-line bg-panel ${
        interactive
          ? "transition-colors duration-(--dur-base) ease-standard hover:border-accent has-[:focus-visible]:border-accent"
          : ""
      } ${className}`}
      {...props}
    >
      <div className="label flex h-8 items-center justify-between gap-4 border-b border-line px-5 text-[11px] whitespace-pre">
        <span className="text-fg">{title}</span>
        {meta != null && <span className="text-muted">{meta}</span>}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
      <Screw className="top-[12px] left-[6px]" />
      <Screw className="top-[12px] right-[6px]" />
      <Screw className="bottom-[6px] left-[6px]" />
      <Screw className="right-[6px] bottom-[6px]" />
    </div>
  );
}
