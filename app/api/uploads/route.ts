import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile } from "@/src/server/supabaseServer";

const ALLOWED_BUCKETS = new Set(["inspection-photos", "order-attachments"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const POST = withApiHandler(async (request) => {
  const { user, profile } = await requireRequestProfile(request);
  if (profile.role === "client") throw new ApiError("Client accounts cannot upload files", 403, "FORBIDDEN");

  const form = await request.formData();
  const file = form.get("file");
  const bucket = form.get("bucket");
  const path = form.get("path");

  if (!(file instanceof File) || file.size === 0) throw new ApiError("file is required", 400, "VALIDATION_ERROR");
  if (file.size > MAX_FILE_SIZE) throw new ApiError("文件超过 10MB 限制", 413, "FILE_TOO_LARGE");
  if (typeof bucket !== "string" || !ALLOWED_BUCKETS.has(bucket)) {
    throw new ApiError("bucket is invalid", 400, "VALIDATION_ERROR");
  }
  if (typeof path !== "string" || path.includes("..") || !path.startsWith(`${user.id}/`)) {
    throw new ApiError("path is invalid", 400, "VALIDATION_ERROR");
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw new ApiError(error.message, 400, "UPLOAD_FAILED");

  const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return apiSuccess({ path, url }, 201);
});
