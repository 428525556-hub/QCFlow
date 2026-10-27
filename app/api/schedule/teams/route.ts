import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { assertWriteBackendSupported, getDataBackend } from "@/src/server/db/backend";
import { listInspectionTeams } from "@/src/server/db/schedule";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

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
  assertWriteBackendSupported();
  const payload = (await request.json()) as TeamInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("inspection_teams")
    .insert({ ...payload, capacity_factors: payload.capacity_factors ?? { normal: 1, xray: 0.8, field: 0.7 } })
    .select("*")
    .single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
