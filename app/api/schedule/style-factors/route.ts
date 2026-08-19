import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type StyleInsert = Database["public"]["Tables"]["style_categories"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").select("*").order("factor", { ascending: true });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as StyleInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").insert(payload).select("*").single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
