import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "ghost";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  ghost: "bg-transparent hover:bg-muted",
};

export function buttonClassName(
  variant: NonNullable<ButtonProps["variant"]> = "default",
  className = "",
): string {
  return `inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-4 text-sm font-medium transition ${variants[variant]} ${className}`;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={`${buttonClassName(variant, className)} disabled:opacity-50`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
