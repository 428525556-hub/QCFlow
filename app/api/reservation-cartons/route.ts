import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { withTransaction } from "@/src/server/db/query";
import { listReservationCartonItems, listReservationCartons } from "@/src/server/db/reservations";
import { insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { ReservationCarton, ReservationCartonItem } from "@/lib/types";
import type { Database } from "@/src/types";

type ReservationCartonInsert = Database["public"]["Tables"]["reservation_cartons"]["Insert"];
type ReservationCartonItemInsert = Database["public"]["Tables"]["reservation_carton_items"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (!orderId) throw new ApiError("orderId is required", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    const [cartons, items] = await Promise.all([
      listReservationCartons(orderId),
      listReservationCartonItems(orderId)
    ]);
    return apiSuccess({ cartons, items });
  }

  const supabase = createRequestSupabaseClient(request);
  const [{ data: cartons, error: cartonsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("reservation_cartons").select("*").eq("order_id", orderId).order("carton_no"),
    supabase.from("reservation_carton_items").select("*").eq("order_id", orderId)
  ]);

  if (cartonsError) throw databaseError(cartonsError);
  if (itemsError) throw databaseError(itemsError);
  return apiSuccess({ cartons: cartons ?? [], items: items ?? [] });
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const payload = (await request.json()) as {
    cartons: ReservationCartonInsert[];
    items: ReservationCartonItemInsert[];
  };

  if (!Array.isArray(payload.cartons) || payload.cartons.length === 0) throw new ApiError("cartons is required", 400, "VALIDATION_ERROR");

  const supabase = createRequestSupabaseClient(request);
  const cartonRows = payload.cartons.map((carton) => ({ ...carton, user_id: user.id }));
  const itemRows = (payload.items ?? []).map((item) => ({ ...item, user_id: user.id }));

  if (getDataBackend() === "pg") {
    try {
      const result = await withTransaction(async (client) => {
        const cartons = await insertRows<ReservationCarton>(
          "reservation_cartons",
          cartonRows,
          TABLE_COLUMNS.reservation_cartons,
          client
        );
        const items =
          itemRows.length > 0
            ? await insertRows<ReservationCartonItem>(
                "reservation_carton_items",
                itemRows,
                TABLE_COLUMNS.reservation_carton_items,
                client
              )
            : [];
        return { cartons, items };
      });
      return apiSuccess(result, 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const { data: cartons, error: cartonsError } = await supabase.from("reservation_cartons").insert(cartonRows).select("*");
  if (cartonsError) throw databaseError(cartonsError);

  let items = null;
  if (itemRows.length > 0) {
    const { data, error } = await supabase.from("reservation_carton_items").insert(itemRows).select("*");
    if (error) throw databaseError(error);
    items = data;
  }

  return apiSuccess({ cartons: cartons ?? [], items: items ?? [] }, 201);
});
