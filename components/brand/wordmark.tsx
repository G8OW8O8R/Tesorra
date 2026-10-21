import type { ComponentProps } from "react";
import { WORDMARK_PATH, WORDMARK_VIEWBOX } from "./wordmark-path";

type WordmarkProps = Omit<ComponentProps<"svg">, "viewBox" | "children"> & {
  /** Hide from assistive technology when a parent already names the link. */
  decorative?: boolean;
};

/** TESORRA wordmark as inline SVG; takes its colour from `currentColor` and its size from width/height or CSS. */
export function Wordmark({ decorative = false, className = "", ...props }: WordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={WORDMARK_VIEWBOX}
      fill="currentColor"
      className={`block h-auto ${className}`}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Tesorra" })}
      focusable="false"
      {...props}
    >
      <path fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}
