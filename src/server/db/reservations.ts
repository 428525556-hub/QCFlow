import type { ReservationCarton, ReservationCartonItem } from "@/lib/types";

import { selectAll } from "./read.ts";

export async function listReservationCartons(orderId: string): Promise<ReservationCarton[]> {
  return selectAll<ReservationCarton>("reservation_cartons", {
    conditions: ["order_id = $1"],
    values: [orderId],
    orderBy: "carton_no asc"
  });
}

export async function listReservationCartonItems(orderId: string): Promise<ReservationCartonItem[]> {
  return selectAll<ReservationCartonItem>("reservation_carton_items", {
    conditions: ["order_id = $1"],
    values: [orderId]
  });
}
