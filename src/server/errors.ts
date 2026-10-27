export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: string;

  constructor(message: string, status = 500, code = "INTERNAL_ERROR", details?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error: unknown) {
  if (error instanceof ApiError) return error;

  const value = error as { message?: string; code?: string; details?: string } | null;
  return new ApiError(value?.message ?? "Unexpected server error", 500, value?.code ?? "INTERNAL_ERROR", value?.details);
}

export function databaseError(error: { message: string; code?: string; details?: string }, status = 400) {
  return new ApiError(error.message, status, error.code ?? "DATABASE_ERROR", error.details);
}
