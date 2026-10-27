import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { assertWriteBackendSupported, getDataBackend } from "@/src/server/db/backend";
import { listStyleCategories } from "@/src/server/db/schedule";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type StyleInsert = Database["public"]["Tables"]["style_categories"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  if (getDataBackend() === "pg") {
    return apiSuccess(await listStyleCategories());
  }
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").select("*").order("factor", { ascending: true });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  assertWriteBackendSupported();
  const payload = (await request.json()) as StyleInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").insert(payload).select("*").single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
