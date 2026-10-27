import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { deleteRowsByIds, updateRowById } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile } from "@/src/server/supabaseServer";
import type { InspectionTeam } from "@/lib/types";
import type { Database } from "@/src/types";

type TeamUpdate = Database["public"]["Tables"]["inspection_teams"]["Update"];
type Context = { params: { id: string } };

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as TeamUpdate;
  const row = { ...payload, updated_at: new Date().toISOString() };

  if (getDataBackend() === "pg") {
    try {
      const data = await updateRowById<InspectionTeam>(
        "inspection_teams",
        params.id,
        row,
        TABLE_COLUMNS.inspection_teams
      );
      if (!data) throw new ApiError("Team not found", 404, "NOT_FOUND");
      return apiSuccess(data);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("inspection_teams")
    .update(row)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Team not found", 404, "NOT_FOUND");
  return apiSuccess(data);
});

export const DELETE = withApiHandler<Context>(async (request, { params }) => {
  await requireAdminProfile(request);
  if (getDataBackend() === "pg") {
    try {
      const deleted = await deleteRowsByIds("inspection_teams", [params.id]);
      if (deleted.length === 0) throw new ApiError("Team not found", 404, "NOT_FOUND");
      return apiSuccess({ id: params.id });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("inspection_teams").delete().eq("id", params.id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Team not found", 404, "NOT_FOUND");
  return apiSuccess({ id: params.id });
});
