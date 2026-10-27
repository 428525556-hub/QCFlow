import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { listProductionCalendar, upsertProductionCalendar } from "@/src/server/db/schedule";
import { deleteRowsByIds } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type CalendarInsert = Database["public"]["Tables"]["production_calendar"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");

  if (getDataBackend() === "pg") {
    return apiSuccess(await listProductionCalendar({ from, to }));
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("production_calendar").select("*").order("date", { ascending: true });
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as CalendarInsert;
  if (!payload.date) throw new ApiError("date is required", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    try {
      return apiSuccess(
        await upsertProductionCalendar({
          date: payload.date,
          is_work_day: payload.is_work_day ?? true,
          work_hours: payload.work_hours ?? null,
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
    .from("production_calendar")
    .upsert(payload, { onConflict: "date" })
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
      const deleted = await deleteRowsByIds("production_calendar", [id]);
      if (deleted.length === 0) throw new ApiError("Calendar entry not found", 404, "NOT_FOUND");
      return apiSuccess({ id });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("production_calendar").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Calendar entry not found", 404, "NOT_FOUND");
  return apiSuccess({ id });
});
