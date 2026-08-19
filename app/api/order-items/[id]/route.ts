import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type OrderItemUpdate = Database["public"]["Tables"]["order_items"]["Update"];
type Context = { params: { id: string } };

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  const payload = (await request.json()) as OrderItemUpdate;
  const supabase = createRequestSupabaseClient(request);

  const { data: existing, error: fetchError } = await supabase.from("order_items").select("*").eq("id", params.id).maybeSingle();
  if (fetchError) throw databaseError(fetchError);
  if (!existing) throw new ApiError("Order item not found", 404, "NOT_FOUND");

  const next: OrderItemUpdate = { ...payload };

  // 入库数量自动同步为可送检数量（数量跟随入库，状态不自动改变）；
  // 若本次同时人工指定了送检数量，则以人工值为准
  if (next.inbound_quantity !== undefined) {
    const nextInbound = Math.max(0, Math.floor(Number(next.inbound_quantity) || 0));
    const maxQuantity = Number(existing.quantity || 0);
    if (nextInbound > maxQuantity) throw new ApiError("inbound_quantity cannot exceed quantity", 400, "VALIDATION_ERROR");
    next.inbound_quantity = nextInbound;
    if (next.submitted_quantity === undefined) {
      next.submitted_quantity = Math.min(nextInbound, maxQuantity);
    }
  }

  if (next.submitted_quantity !== undefined) {
    const submitted = Math.max(0, Math.floor(Number(next.submitted_quantity) || 0));
    const maxQuantity = Number(next.quantity ?? existing.quantity ?? 0);
    if (submitted > maxQuantity) throw new ApiError("submitted_quantity cannot exceed quantity", 400, "VALIDATION_ERROR");
    next.submitted_quantity = submitted;
  }
  if (next.submit_status !== undefined && !["pending", "ready", "paused"].includes(next.submit_status)) {
    throw new ApiError("invalid submit_status", 400, "VALIDATION_ERROR");
  }
  if (next.style_factor !== undefined && Number(next.style_factor) <= 0) {
    throw new ApiError("style_factor must be positive", 400, "VALIDATION_ERROR");
  }

  const { data, error } = await supabase.from("order_items").update(next).eq("id", params.id).select("*").maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Order item not found or no permission to update", 404, "NOT_FOUND");
  return apiSuccess(data);
});
