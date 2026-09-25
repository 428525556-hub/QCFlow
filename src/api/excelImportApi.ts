import { supabase } from "@/src/api/client";
import { apiRequest, type ApiResult } from "@/src/api/httpClient";
import type { ExcelImportRow } from "@/src/utils/excelImport";

export type ImportPreviewData = {
  rows: ExcelImportRow[];
  headers: string[];
  summary: { total: number; ok: number; needConfirm: number; error: number; totalCartons: number; totalQuantity: number };
  debug?: {
    headerRowIndex: number;
    rawHeaders: string[];
    mapped: Array<{ column: number; header: string; field: string }>;
    samples: Array<{ row: number; fields: Record<string, { type: string; preview: string }> }>;
  };
};

export type ImportResultData = {
  successCount: number;
  failCount: number;
  results: Array<{ rowNumber: number; success: boolean; message: string; orderId: string | null }>;
};

export async function previewExcelImport(file: File): Promise<ApiResult<ImportPreviewData>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { data: null, error: { message: "Unauthorized" } };

  const form = new FormData();
  form.append("file", file);

  try {
    const response = await fetch("/api/orders/import/preview", {
      method: "POST",
      body: form,
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = (await response.json()) as ApiResult<ImportPreviewData> & { requestId?: string };
    if (!response.ok && !json.error) {
      return { data: null, error: { message: `Request failed with status ${response.status}` }, requestId: json.requestId };
    }
    return json;
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Network request failed" } };
  }
}

export async function confirmExcelImport(rows: ExcelImportRow[]): Promise<ApiResult<ImportResultData>> {
  return apiRequest<ImportResultData>("/api/orders/import", { method: "POST", body: JSON.stringify({ rows }) });
}

export async function downloadImportTemplate(): Promise<{ error?: string }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { error: "Unauthorized" };

  try {
    const response = await fetch("/api/orders/import/template", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return { error: `下载失败（${response.status}）` };
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "qcflow-reservation-import-template.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "网络错误" };
  }
}
