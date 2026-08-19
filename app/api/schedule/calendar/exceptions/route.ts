import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type ExceptionInsert = Database["public"]["Tables"]["team_work_exceptions"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const params = request.nextUrl.searchParams;
  const teamId = params.get("teamId");
  const from = params.get("from");
  const to = params.get("to");
  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("team_work_exceptions").select("*").order("date", { ascending: true });
  if (teamId) query = query.eq("team_id", teamId);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as ExceptionInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("team_work_exceptions")
    .upsert(payload, { onConflict: "team_id,date" })
    .select("*")
    .single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

export const DELETE = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("id is required", 400, "VALIDATION_ERROR");
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("team_work_exceptions").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Exception not found", 404, "NOT_FOUND");
  return apiSuccess({ id });
});
