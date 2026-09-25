"use client";

import { Camera } from "lucide-react";
import type { ChangeEvent } from "react";

type PhotoPickerProps = {
  preview: string;
  hint: string;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  compact?: boolean;
};

export function PhotoPicker({ preview, hint, onPick, compact = false }: PhotoPickerProps) {
  return (
    <label
      className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-blue-50 p-3 text-center ${
        compact ? "min-h-24" : "min-h-32"
      }`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="照片预览" className={`rounded object-contain ${compact ? "max-h-20" : "max-h-56"}`} />
      ) : (
        <>
          <Camera size={compact ? 22 : 30} className="text-blue-500" />
          <span className={`font-bold text-slate-600 ${compact ? "mt-1 text-xs" : "mt-2 text-sm"}`}>{hint}</span>
        </>
      )}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} />
    </label>
  );
}
