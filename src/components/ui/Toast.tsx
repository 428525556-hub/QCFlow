type ToastTone = "info" | "success" | "warning" | "error";

type ToastProps = {
  message: string;
  tone?: ToastTone;
};

const toneClassName: Record<ToastTone, string> = {
  info: "bg-blue-50 text-blue-800",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700"
};

export function Toast({ message, tone = "info" }: ToastProps) {
  if (!message) return null;

  return <p className={`rounded px-3 py-2 text-sm font-bold ${toneClassName[tone]}`}>{message}</p>;
}

