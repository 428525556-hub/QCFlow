import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { findExistingDuplicateKeys, importRows, MAX_IMPORT_ROWS } from "@/src/services/excelImportService";
import type { ExcelImportRow } from "@/src/utils/excelImport";

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json()) as { rows?: ExcelImportRow[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw new ApiError("没有可导入的数据", 400, "VALIDATION_ERROR");
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError(`单次最多导入 ${MAX_IMPORT_ROWS} 行`, 400, "VALIDATION_ERROR");
  }

  const supabase = createRequestSupabaseClient(request);
  const existingKeys = await findExistingDuplicateKeys(supabase, body.rows);
  const results = await importRows(supabase, body.rows, existingKeys);

  const successCount = results.filter((result) => result.success).length;
  const failCount = results.length - successCount;
  return apiSuccess({ successCount, failCount, results });
});
