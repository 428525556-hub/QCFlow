type LoadingProps = {
  label?: string;
};

export function Loading({ label = "正在加载..." }: LoadingProps) {
  return <div className="panel p-5 text-sm font-bold text-slate-500">{label}</div>;
}

