import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <label className="space-y-1">
      {label && <span className="label">{label}</span>}
      <input className={`field ${className}`.trim()} {...props} />
    </label>
  );
}

export function Textarea({ label, className = "", ...props }: TextareaProps) {
  return (
    <label className="space-y-1">
      {label && <span className="label">{label}</span>}
      <textarea className={`field ${className}`.trim()} {...props} />
    </label>
  );
}

