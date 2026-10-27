import { ApiError } from "../errors.ts";

/** 把 PostgreSQL 错误码映射成 API 响应（与 Supabase 分支的错误风格保持一致） */
export function pgError(error: unknown): ApiError {
  const value = error as { code?: string; message?: string } | null;
  const message = value?.message ?? "Database error";

  switch (value?.code) {
    case "42501":
      return new ApiError("Forbidden", 403, "FORBIDDEN");
    case "P0002":
      return new ApiError(message, 404, "NOT_FOUND");
    case "23505":
      return new ApiError(message, 409, "CONFLICT");
    case "23502":
    case "23514":
    case "22P02":
    case "22023":
      return new ApiError(message, 400, "VALIDATION_ERROR");
    default:
      return new ApiError(message, 500, "DATABASE_ERROR");
  }
}
