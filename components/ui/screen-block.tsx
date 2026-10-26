import type { ComponentProps, ElementType } from "react";

type ScreenBlockProps = ComponentProps<"section"> & {
  as?: ElementType;
  /** One full screen under the bar, its content kept clear of the dock along the bottom edge. */
  screen?: boolean;
};

/**
 * A block of a sub-page on the page's safe zones: side gutters, nothing under the bar, and the band
 * along the bottom edge (`--dock-h`) left to the dock, as on the home page.
 */
export function ScreenBlock({ as: Tag = "section", screen = false, className = "", children, ...props }: ScreenBlockProps) {
  return (
    <Tag className={`relative z-10 px-(--gutter) ${screen ? "block-screen" : "block-flow"} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
