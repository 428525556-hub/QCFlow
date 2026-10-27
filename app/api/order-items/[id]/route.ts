import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { listOrderItems } from "@/src/server/db/orders";
import { pgError } from "@/src/server/db/pgErrors";
import { updateRowById } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { OrderItem } from "@/lib/types";
import type { Database } from "@/src/types";

type OrderItemUpdate = Database["public"]["Tables"]["order_items"]["Update"];
type Context = { params: { id: string } };

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  const payload = (await request.json()) as OrderItemUpdate;
  const backend = getDataBackend();
  const supabase = backend === "supabase" ? createRequestSupabaseClient(request) : null;

  let existing: OrderItem | null;
  if (backend === "pg") {
    try {
      [existing = null] = await listOrderItems({ itemIds: [params.id] });
    } catch (error) {
      throw pgError(error);
    }
  } else {
    const { data, error: fetchError } = await supabase!
      .from("order_items")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (fetchError) throw databaseError(fetchError);
    existing = data as OrderItem | null;
  }
  if (!existing) throw new ApiError("Order item not found", 404, "NOT_FOUND");

  const next: OrderItemUpdate = { ...payload };

  // 入库数量自动同步为可送检数量，并自动置为"可送检"状态（可直接参与排程）；
  // 若本次同时人工指定了送检数量/状态，则以人工值为准
  if (next.inbound_quantity !== undefined) {
    const nextInbound = Math.max(0, Math.floor(Number(next.inbound_quantity) || 0));
    const maxQuantity = Number(existing.quantity || 0);
    if (nextInbound > maxQuantity) throw new ApiError("inbound_quantity cannot exceed quantity", 400, "VALIDATION_ERROR");
    next.inbound_quantity = nextInbound;
    if (next.submitted_quantity === undefined) {
      next.submitted_quantity = Math.min(nextInbound, maxQuantity);
    }
    if (next.submit_status === undefined) {
      next.submit_status = "ready";
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

  if (backend === "pg") {
    try {
      const data = await updateRowById<OrderItem>(
        "order_items",
        params.id,
        next,
        TABLE_COLUMNS.order_items
      );
      if (!data) throw new ApiError("Order item not found", 404, "NOT_FOUND");
      return apiSuccess(data);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const { data, error } = await supabase!.from("order_items").update(next).eq("id", params.id).select("*").maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Order item not found or no permission to update", 404, "NOT_FOUND");
  return apiSuccess(data);
});
