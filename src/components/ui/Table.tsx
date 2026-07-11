import type { ReactNode, TableHTMLAttributes } from "react";

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
};

export function Table({ className = "", children, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto rounded border border-line bg-white">
      <table className={`w-full min-w-full border-collapse text-sm ${className}`.trim()} {...props}>
        {children}
      </table>
    </div>
  );
}

