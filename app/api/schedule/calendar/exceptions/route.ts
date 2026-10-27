import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { listTeamWorkExceptions, upsertTeamWorkException } from "@/src/server/db/schedule";
import { deleteRowsByIds } from "@/src/server/db/write";
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

  if (getDataBackend() === "pg") {
    return apiSuccess(await listTeamWorkExceptions({ teamId, from, to }));
  }

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
  if (!payload.team_id) throw new ApiError("team_id is required", 400, "VALIDATION_ERROR");
  if (!payload.date) throw new ApiError("date is required", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    try {
      return apiSuccess(
        await upsertTeamWorkException({
          team_id: payload.team_id,
          date: payload.date,
          is_working: payload.is_working ?? true,
          work_hours: payload.work_hours ?? null,
          capacity_factor: payload.capacity_factor ?? null,
          remark: payload.remark ?? null
        }),
        201
      );
    } catch (error) {
      throw pgError(error);
    }
  }

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

  if (getDataBackend() === "pg") {
    try {
      const deleted = await deleteRowsByIds("team_work_exceptions", [id]);
      if (deleted.length === 0) throw new ApiError("Exception not found", 404, "NOT_FOUND");
      return apiSuccess({ id });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("team_work_exceptions").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Exception not found", 404, "NOT_FOUND");
  return apiSuccess({ id });
});
