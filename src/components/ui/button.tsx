import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border-input hover:bg-surface-sunken",
  ghost: "bg-transparent text-text hover:bg-surface-sunken",
  danger: "bg-danger text-on-danger hover:opacity-90",
  success: "bg-success text-on-success hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-control-sm px-3 text-sm",
  md: "h-control-md px-4 text-sm",
  lg: "h-control-lg px-6 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      // Busy buttons ignore clicks (no double submits) but stay in the tab order for screen readers.
      aria-disabled={disabled || loading || undefined}
      disabled={disabled}
      onClickCapture={loading ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md font-semibold ease-token transition-[background-color,transform,opacity]",
        "active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  variant?: "ghost" | "secondary";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md ease-token transition-colors disabled:opacity-50",
        size === "sm" ? "size-control-sm" : "size-control-md",
        variant === "ghost" ? "text-text hover:bg-surface-sunken" : "border border-border-input bg-surface hover:bg-surface-sunken",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
