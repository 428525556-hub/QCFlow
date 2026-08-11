import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];
type Context = { params: { id: string } };

export const GET = withApiHandler<Context>(async (request, { params }) => {
  const { profile } = await requireRequestProfile(request);
  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("orders").select("*").eq("id", params.id);
  if (request.nextUrl.searchParams.get("includeDeleted") !== "true") query = query.is("deleted_at", null);

  const { data, error } = await query.single();
  if (error) throw databaseError(error, error.code === "PGRST116" ? 404 : 400);
  if (profile.role === "field_inspector" && (data.customer_name !== profile.customer_name || data.inspection_plan !== "field")) throw new ApiError("Forbidden", 403, "FORBIDDEN");
  return apiSuccess(data);
});

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  const payload = (await request.json()) as OrderUpdate;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("orders").update(payload).eq("id", params.id).select("*").maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Order not found or no permission to update", 404, "NOT_FOUND");
  return apiSuccess(data);
});

export const DELETE = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("orders").delete().eq("id", params.id).select("id").maybeSingle();

  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Order not found or no permission to delete", 404, "NOT_FOUND");
  return apiSuccess({ id: params.id });
});
