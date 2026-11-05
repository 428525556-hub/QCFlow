import { supabase } from "@/src/api/client";
import { isLocalAuthBackend } from "@/src/api/userApi";

type ApiError = { message: string; code?: string; details?: string };

export type ApiResult<T> = ({ data: T; error: null } | { data: null; error: ApiError }) & { requestId?: string };

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!isLocalAuthBackend()) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Unauthorized");
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers
  });
}

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
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await apiFetch(path, {
      ...init,
      headers
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

/** multipart/form-data 版本的 API 请求（上传文件用） */
export async function apiRequestForm<T>(path: string, body: FormData): Promise<ApiResult<T>> {
  try {
    const response = await apiFetch(path, {
      method: "POST",
      body
    });
    return await readApiResult<T>(response);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "Network request failed" }
    };
  }
}
