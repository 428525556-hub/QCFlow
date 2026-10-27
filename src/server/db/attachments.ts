import type { OrderAttachment } from "@/lib/types";

import { selectAll } from "./read.ts";

export async function listOrderAttachments(orderId: string): Promise<OrderAttachment[]> {
  return selectAll<OrderAttachment>("order_attachments", {
    conditions: ["order_id = $1"],
    values: [orderId],
    orderBy: "created_at asc"
  });
}
