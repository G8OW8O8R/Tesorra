"use client";

import { useState } from "react";

type QuantityStepperProps = {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  labels: { quantity: string; decrease: string; increase: string };
  size?: "sm" | "md";
};

const step =
  "grid h-full w-10 place-items-center text-muted transition-colors duration-(--dur-fast) ease-standard hover:text-accent disabled:pointer-events-none disabled:opacity-30";

/** − n + counter with tabular digits. */
export function QuantityStepper({ value, defaultValue = 1, onChange, min = 1, max = 9, labels, size = "md" }: QuantityStepperProps) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    setOwn(clamped);
    onChange?.(clamped);
  };

  return (
    <div
      role="group"
      aria-label={labels.quantity}
      className={`label inline-flex items-center border border-line text-xs transition-colors duration-(--dur-fast) ease-standard hover:border-fg/25 ${
        size === "sm" ? "h-8" : "h-11"
      }`}
    >
      <button type="button" aria-label={labels.decrease} disabled={current <= min} onClick={() => set(current - 1)} className={step}>
        −
      </button>
      <output aria-live="polite" className="w-8 text-center text-fg tabular-nums">
        {String(current).padStart(2, "0")}
      </output>
      <button type="button" aria-label={labels.increase} disabled={current >= max} onClick={() => set(current + 1)} className={step}>
        +
      </button>
    </div>
  );
}
