import { clsx } from "clsx";

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";

const TONE_CLASS: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600",
  blue: "bg-primary/10 text-primary-dark",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-600",
  violet: "bg-violet-50 text-violet-700"
};

const STATUS_TONE: Record<string, Tone> = {
  未开始: "gray",
  待开始: "gray",
  已取消: "gray",
  已调整: "gray",
  检品中: "blue",
  进行中: "blue",
  已完成: "green",
  部分完成: "amber",
  延期: "red",
  紧急: "red",
  超负荷: "violet",
  green: "green",
  yellow: "amber",
  orange: "amber",
  red: "red",
  overload: "violet"
};

export function Badge({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const resolved = tone ?? STATUS_TONE[status] ?? "gray";
  return (
    <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", TONE_CLASS[resolved], className)}>
      {status}
    </span>
  );
}
