import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listInspectionTeams } from "@/src/server/db/schedule";
import { insertRows } from "@/src/server/db/write";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";
import type { InspectionTeam } from "@/lib/types";

type TeamInsert = Database["public"]["Tables"]["inspection_teams"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  if (getDataBackend() === "pg") {
    return apiSuccess(await listInspectionTeams());
  }
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("inspection_teams").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as TeamInsert;
  const row = {
    ...payload,
    capacity_factors: payload.capacity_factors ?? { normal: 1, xray: 0.8, field: 0.7 }
  };

  if (getDataBackend() === "pg") {
    try {
      const [data] = await insertRows<InspectionTeam>(
        "inspection_teams",
        [row],
        TABLE_COLUMNS.inspection_teams
      );
      return apiSuccess(data, 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("inspection_teams")
    .insert(row)
    .select("*")
    .single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
