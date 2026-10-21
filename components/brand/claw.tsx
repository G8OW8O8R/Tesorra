import type { ComponentProps } from "react";

/**
 * The livery claw: a sharp cut that ends in a ragged point.
 * Each shape is drawn pointing right; flip with CSS (`-scale-x-100`) when needed.
 */
export const CLAW = {
  /** Blade at the end of a 1px rule; sits on the rule's centre line (y 7.5–8.5). */
  divider: {
    viewBox: "0 0 120 16",
    d: "M0 7.5 L58 4.6 L84 2 L120 8 L109 9.6 L114 11.8 L100 11 L103 13.6 L86 11.8 L58 9.5 L0 8.5Z",
  },
  /** Leaning shard for the active item in lists and the chapter index. */
  marker: {
    viewBox: "0 0 12 20",
    d: "M4 0 H12 L7.5 10.8 L10 11.4 L3 20 L4.6 13 L1.4 12.4Z",
  },
  /**
   * Page-transition wipe: solid on the left, three ragged claws leading on the right.
   * Translate it across the viewport (or use the path in a CSS mask) to cover or reveal.
   */
  mask: {
    viewBox: "0 0 200 100",
    d: "M0 0 H128 L170 14 L150 18 L158 22 L134 24 L178 46 L156 50 L166 56 L138 58 L190 82 L164 86 L172 92 L140 94 L120 100 H0Z",
  },
} as const;

export type ClawVariant = keyof typeof CLAW;

type ClawProps = Omit<ComponentProps<"svg">, "viewBox" | "children"> & {
  variant: ClawVariant;
};

/** Claw shape filled with `currentColor`; decorative, sized by CSS. */
export function Claw({ variant, className = "", ...props }: ClawProps) {
  const { viewBox, d } = CLAW[variant];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden
      focusable="false"
      preserveAspectRatio={variant === "mask" ? "none" : undefined}
      className={`block shrink-0 ${className}`}
      {...props}
    >
      <path d={d} />
    </svg>
  );
}

/** Hairline rule that ends in a claw blade. */
export function ClawDivider({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div aria-hidden className={`flex items-center ${className}`} {...props}>
      <span className="h-px flex-1 bg-current" />
      <Claw variant="divider" className="-ml-px h-4 w-[120px]" />
    </div>
  );
}
