"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
};

/** Text, number, money (prefix "₹") and phone (prefix "+91") all use this. */
export function Field({ label, hint, error, prefix, className, required, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
        {required && <span className="text-text-muted font-normal"> (required)</span>}
      </label>
      <div
        className={cn(
          "flex h-control-md items-center rounded-md border bg-bg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          error ? "border-danger" : "border-border-input",
        )}
      >
        {prefix && <span className="pl-3 text-sm text-text-muted num">{prefix}</span>}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 bg-transparent px-3 text-base text-text outline-none placeholder:text-text-muted"
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border-2 ease-token transition-colors disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-border-input bg-surface-sunken",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block size-5 rounded-pill shadow-card ease-token transition-transform",
            checked ? "translate-x-[22px] bg-on-accent" : "translate-x-[2px] bg-text-muted",
          )}
        />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="text-sm text-text">
        {label}
      </label>
    </div>
  );
}
