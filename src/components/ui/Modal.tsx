"use client";

import type { ReactNode } from "react";

import { Button } from "./Button";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <section className="panel w-full max-w-lg p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-blue-950">{title}</h2>
          <Button type="button" variant="ghost" className="px-3 py-2" onClick={onClose}>
            关闭
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}

