import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  padded?: boolean;
};

export function Card({ hover, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-line/80 bg-white shadow-soft",
        padded && "p-5",
        hover && "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
