"use client";

import { Camera } from "lucide-react";
import type { ChangeEvent } from "react";

type PhotoPickerProps = {
  preview: string;
  hint: string;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function PhotoPicker({ preview, hint, onPick }: PhotoPickerProps) {
  return (
    <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-line bg-blue-50 p-3 text-center">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="照片预览" className="max-h-56 rounded object-contain" />
      ) : (
        <>
          <Camera size={30} className="text-blue-500" />
          <span className="mt-2 text-sm font-bold text-slate-600">{hint}</span>
        </>
      )}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} />
    </label>
  );
}
