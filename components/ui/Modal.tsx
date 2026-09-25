"use client";

import { clsx } from "clsx";
import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  children,
  size = "md",
  closeOnBackdrop = true,
  footer
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-2xl",
    lg: "sm:max-w-4xl",
    xl: "sm:max-w-[1400px]"
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        className={clsx(
          "dialog-enter flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-dialog sm:max-h-[calc(100dvh-32px)] sm:rounded-2xl",
          sizes[size]
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-line/70 bg-white px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">{footer}</div>}
      </div>
    </div>
  );
}
