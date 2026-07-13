import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const supabase = createRequestSupabaseClient(request);
  const orderId = request.nextUrl.searchParams.get("orderId");
  let query = supabase.from("order_items").select("*");
  if (orderId) query = query.eq("order_id", orderId);

  const { data, error } = await query.order("color").order("size");
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const user = await requireRequestUser(request);
  const payload = (await request.json()) as OrderItemInsert[];
  const rows = payload.map((item) => ({ ...item, user_id: user.id }));
  const supabase = createRequestSupabaseClient(request);
  let { data, error } = await supabase.from("order_items").insert(rows).select("*");

  if (error && /carton_count|quantity_per_carton/i.test(error.message)) {
    const fallbackRows = rows.map(({ carton_count, quantity_per_carton, ...row }) => row);
    const fallbackResult = await supabase.from("order_items").insert(fallbackRows).select("*");
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

export const DELETE = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const { ids } = (await request.json()) as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError("ids is required", 400, "VALIDATION_ERROR");

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.from("order_items").delete().in("id", ids);
  if (error) throw databaseError(error);
  return apiSuccess({ ids });
});
