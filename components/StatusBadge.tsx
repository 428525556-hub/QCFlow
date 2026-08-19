import type { OrderStatus } from "@/lib/types";
import { Badge } from "@/components/ui";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge status={status} />;
}
