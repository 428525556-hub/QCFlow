import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listStyleCategories } from "@/src/server/db/schedule";
import { insertRows } from "@/src/server/db/write";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { StyleCategory } from "@/lib/types";
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
  const payload = (await request.json()) as StyleInsert;
  if (getDataBackend() === "pg") {
    try {
      const [data] = await insertRows<StyleCategory>(
        "style_categories",
        [payload],
        TABLE_COLUMNS.style_categories
      );
      return apiSuccess(data, 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").insert(payload).select("*").single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
