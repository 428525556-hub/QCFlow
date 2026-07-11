import { NextResponse } from "next/server";

type ApiError = {
  message: string;
  code?: string;
  details?: string;
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null }, { status });
}

export function apiFailure(error: unknown, status = 500) {
  const value = error as (Partial<ApiError> & { code?: string }) | null;
  const payload: ApiError = {
    message: value?.message ?? "Unexpected server error",
    ...(value?.code ? { code: value.code } : {}),
    ...(value?.details ? { details: value.details } : {})
  };

  return NextResponse.json({ data: null, error: payload }, { status });
}
