import { supabase } from "@/src/api/client";

type ApiError = { message: string; code?: string; details?: string };

export type ApiResult<T> = ({ data: T; error: null } | { data: null; error: ApiError }) & { requestId?: string };

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { data: null, error: { message: sessionError.message } };

  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: { message: "Unauthorized" } };

  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers
      }
    });
    const result = (await response.json()) as ApiResult<T>;

    if (!response.ok && !result.error) {
      return { data: null, error: { message: `Request failed with status ${response.status}` } };
    }

    return result;
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "Network request failed" }
    };
  }
}
