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
  const { data, error } = await supabase.from("order_items").update(payload).eq("id", params.id).select("*").maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Order item not found or no permission to update", 404, "NOT_FOUND");
  return apiSuccess(data);
});
