import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type StyleUpdate = Database["public"]["Tables"]["style_categories"]["Update"];
type Context = { params: { id: string } };

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as StyleUpdate;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").update(payload).eq("id", params.id).select("*").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Style category not found", 404, "NOT_FOUND");
  return apiSuccess(data);
});

export const DELETE = withApiHandler<Context>(async (request, { params }) => {
  await requireAdminProfile(request);
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").delete().eq("id", params.id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Style category not found", 404, "NOT_FOUND");
  return apiSuccess({ id: params.id });
});
