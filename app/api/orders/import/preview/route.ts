import { ApiError } from "@/src/server/errors";
import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { requireStaffProfile } from "@/src/server/supabaseServer";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseImportFile } from "@/src/services/excelImportService";

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("缺少文件", 400, "VALIDATION_ERROR");
  if (file.size > MAX_IMPORT_BYTES) throw new ApiError("文件大小不能超过 5MB", 400, "VALIDATION_ERROR");

  const buffer = Buffer.from(await file.arrayBuffer());
  let preview;
  try {
    preview = await parseImportFile(buffer, file.name);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "文件解析失败", 400, "PARSE_ERROR");
  }
  if (preview.rows.length > MAX_IMPORT_ROWS) throw new ApiError(`单次最多导入 ${MAX_IMPORT_ROWS} 行`, 400, "VALIDATION_ERROR");

  return apiSuccess(preview);
});
