import { useId, type ComponentProps, type ReactNode } from "react";

const control =
  "w-full border border-line bg-transparent px-3 text-fg outline-none transition-colors duration-(--dur-fast) ease-standard placeholder:text-muted/60 hover:border-fg/25 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-formula";

type FieldShell = {
  label: string;
  hint?: string;
  error?: string;
  /** Shown after the label when the field is required. */
  requiredLabel?: string;
};

function Shell({
  id,
  label,
  hint,
  error,
  required,
  requiredLabel,
  children,
}: FieldShell & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label flex justify-between gap-4 text-[11px] text-muted">
        <span>{label}</span>
        {required && requiredLabel && <span className="text-muted/70">{requiredLabel}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-note`} className="text-sm text-formula">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-note`} className="text-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function controlProps(id: string, { hint, error }: FieldShell) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-note` : undefined,
  } as const;
}

export function TextField({ label, hint, error, requiredLabel, className = "", ...props }: ComponentProps<"input"> & FieldShell) {
  const id = useId();
  const shell = { label, hint, error, requiredLabel };
  return (
    <Shell id={id} required={props.required} {...shell}>
      <input className={`${control} h-11 ${className}`} {...controlProps(id, shell)} {...props} />
    </Shell>
  );
}

export function TextArea({ label, hint, error, requiredLabel, className = "", ...props }: ComponentProps<"textarea"> & FieldShell) {
  const id = useId();
  const shell = { label, hint, error, requiredLabel };
  return (
    <Shell id={id} required={props.required} {...shell}>
      <textarea rows={4} className={`${control} resize-y py-2.5 ${className}`} {...controlProps(id, shell)} {...props} />
    </Shell>
  );
}

export function SelectField({ label, hint, error, requiredLabel, className = "", children, ...props }: ComponentProps<"select"> & FieldShell) {
  const id = useId();
  const shell = { label, hint, error, requiredLabel };
  return (
    <Shell id={id} required={props.required} {...shell}>
      <div className="relative">
        <select className={`${control} h-11 appearance-none bg-bg pr-9 ${className}`} {...controlProps(id, shell)} {...props}>
          {children}
        </select>
        <span aria-hidden className="label pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-muted">
          ▾
        </span>
      </div>
    </Shell>
  );
}
