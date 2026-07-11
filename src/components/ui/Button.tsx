import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "primary-btn",
  secondary: "secondary-btn",
  danger: "inline-flex items-center justify-center gap-2 rounded border border-red-200 bg-white px-4 py-3 font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60",
  ghost: "inline-flex items-center justify-center gap-2 rounded px-4 py-3 font-black text-blue-800 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`${variantClassName[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

