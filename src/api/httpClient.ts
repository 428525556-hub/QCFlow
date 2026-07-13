import { supabase } from "@/src/api/client";

type ApiError = { message: string; code?: string; details?: string };

export type ApiResult<T> = ({ data: T; error: null } | { data: null; error: ApiError }) & { requestId?: string };

async function readApiResult<T>(response: Response): Promise<ApiResult<T>> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    return {
      data: null,
      error: {
        message: response.ok ? "Server returned an invalid response." : `Request failed with status ${response.status}`,
        details: text.slice(0, 500)
      },
      requestId
    };
  }

  try {
    return { ...((await response.json()) as ApiResult<T>), requestId };
  } catch {
    return {
      data: null,
      error: { message: "Server returned an invalid JSON response." },
      requestId
    };
  }
}

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
    const result = await readApiResult<T>(response);

    if (!response.ok && !result.error) {
      return { data: null, error: { message: `Request failed with status ${response.status}` }, requestId: result.requestId };
    }

    return result;
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "Network request failed" }
    };
  }
}
