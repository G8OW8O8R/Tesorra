"use client";

import { useState } from "react";

export type VariantOption = {
  value: string;
  label: string;
  /** CSS colour shown as a chip next to the label (colours, flavours). */
  swatch?: string;
  disabled?: boolean;
};

type VariantPickerProps = {
  name: string;
  legend: string;
  options: readonly VariantOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Read out after the label of an unavailable option. */
  unavailableLabel: string;
};

/** Radio group drawn as a row of chips; the chosen label repeats next to the legend. */
export function VariantPicker({ name, legend, options, value, defaultValue, onChange, unavailableLabel }: VariantPickerProps) {
  const [own, setOwn] = useState(defaultValue ?? options.find((o) => !o.disabled)?.value);
  const selected = value ?? own;
  const selectedLabel = options.find((o) => o.value === selected)?.label;

  return (
    <fieldset>
      <legend className="label flex w-full gap-3 text-[11px] text-muted">
        <span>{legend}</span>
        {selectedLabel && <span className="text-fg">{selectedLabel}</span>}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`label relative inline-flex h-10 min-w-11 items-center justify-center gap-2 border px-3 text-[11px] transition-colors duration-(--dur-fast) ease-standard has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber ${
              o.disabled
                ? "cursor-not-allowed border-line text-muted/50 line-through"
                : o.value === selected
                  ? "cursor-pointer border-fg text-fg"
                  : "cursor-pointer border-line text-muted hover:border-accent hover:text-fg"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === selected}
              disabled={o.disabled}
              onChange={() => {
                setOwn(o.value);
                onChange?.(o.value);
              }}
              className="sr-only"
            />
            {o.swatch && (
              <span aria-hidden className="size-3 border border-fg/20" style={{ backgroundColor: o.swatch }} />
            )}
            <span>{o.label}</span>
            {o.disabled && <span className="sr-only">({unavailableLabel})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
