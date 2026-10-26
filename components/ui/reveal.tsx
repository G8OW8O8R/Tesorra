"use client";

import { useEffect, useRef, type ComponentProps } from "react";

/**
 * Turns on `.ride-in` (its `data-enter` children ride in one after another) the first time a
 * fifth of it is in view.
 */
export function Reveal({ className = "", children, ...props }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.on = "";
        io.disconnect();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`ride-in ${className}`} {...props}>
      {children}
    </div>
  );
}
