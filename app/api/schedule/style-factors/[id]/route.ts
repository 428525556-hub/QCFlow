import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { deleteRowsByIds, updateRowById } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile } from "@/src/server/supabaseServer";
import type { StyleCategory } from "@/lib/types";
import type { Database } from "@/src/types";

type StyleUpdate = Database["public"]["Tables"]["style_categories"]["Update"];
type Context = { params: { id: string } };

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireAdminProfile(request);
  const payload = (await request.json()) as StyleUpdate;
  if (getDataBackend() === "pg") {
    try {
      const data = await updateRowById<StyleCategory>(
        "style_categories",
        params.id,
        payload,
        TABLE_COLUMNS.style_categories
      );
      if (!data) throw new ApiError("Style category not found", 404, "NOT_FOUND");
      return apiSuccess(data);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").update(payload).eq("id", params.id).select("*").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Style category not found", 404, "NOT_FOUND");
  return apiSuccess(data);
});

export const DELETE = withApiHandler<Context>(async (request, { params }) => {
  await requireAdminProfile(request);
  if (getDataBackend() === "pg") {
    try {
      const deleted = await deleteRowsByIds("style_categories", [params.id]);
      if (deleted.length === 0) throw new ApiError("Style category not found", 404, "NOT_FOUND");
      return apiSuccess({ id: params.id });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("style_categories").delete().eq("id", params.id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Style category not found", 404, "NOT_FOUND");
  return apiSuccess({ id: params.id });
});
