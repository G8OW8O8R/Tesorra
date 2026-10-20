import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary";
type Size = "sm" | "md";

const base =
  "label inline-flex select-none items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,translate] duration-(--dur-fast) ease-standard active:translate-y-px disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-amber text-bg hover:bg-fg",
  secondary: "border border-line text-fg hover:border-accent hover:text-accent",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-11 px-5 text-xs",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

type Options = { variant?: Variant; size?: Size };

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & Options) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Options) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
