"use client";

import { Camera } from "lucide-react";
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react";

type PhotoUploadProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  preview?: string;
  label?: ReactNode;
  onFileChange: (file: File | null, event: ChangeEvent<HTMLInputElement>) => void;
};

export function PhotoUpload({ preview, label = "拍照上传", onFileChange, className = "", ...props }: PhotoUploadProps) {
  return (
    <label className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-line bg-blue-50 p-3 text-center ${className}`.trim()}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="上传预览" className="max-h-56 rounded object-contain" />
      ) : (
        <>
          <Camera size={28} className="text-blue-500" />
          <span className="mt-2 text-sm font-bold text-slate-600">{label}</span>
        </>
      )}
      <input
        {...props}
        type="file"
        accept={props.accept ?? "image/*"}
        className="sr-only"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] ?? null, event);
        }}
      />
    </label>
  );
}

