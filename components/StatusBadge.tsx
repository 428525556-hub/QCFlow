import type { OrderStatus } from "@/lib/types";
import { clsx } from "clsx";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded px-2 py-1 text-xs font-bold",
        status === "未开始" && "bg-slate-200 text-slate-700",
        status === "检品中" && "bg-amber-100 text-amber-800",
        status === "已完成" && "bg-emerald-100 text-emerald-800"
      )}
    >
      {status}
    </span>
  );
}
