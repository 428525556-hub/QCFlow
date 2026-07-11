import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database, Json } from "@/src/types";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
type OrderItemInsert = Omit<Database["public"]["Tables"]["order_items"]["Insert"], "order_id">;

export const POST = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const payload = (await request.json()) as { order: OrderInsert; items: OrderItemInsert[] };
  if (!payload.order || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new ApiError("order and at least one item are required", 400, "VALIDATION_ERROR");
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("create_order_with_items", {
    order_payload: payload.order as unknown as Json,
    item_payload: payload.items as unknown as Json
  });

  if (error) throw databaseError(error);
  return apiSuccess({ id: data }, 201);
});
