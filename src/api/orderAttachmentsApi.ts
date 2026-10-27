import { STORAGE_BUCKETS } from "@/src/constants";
import { apiRequest } from "@/src/api/httpClient";
import { getStoragePublicUrl, uploadToStorage } from "@/src/api/uploadApi";
import type { Database } from "@/src/types";

type OrderAttachmentInsert = Database["public"]["Tables"]["order_attachments"]["Insert"];

export function getOrderAttachmentPublicUrl(path: string) {
  return getStoragePublicUrl(STORAGE_BUCKETS.orderAttachments, path);
}

export async function uploadOrderAttachment(path: string, file: File) {
  try {
    const result = await uploadToStorage(STORAGE_BUCKETS.orderAttachments, path, file);
    return { error: null, data: { path: result.path } };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)), data: null };
  }
}

function shouldFallbackToInspectionBucket(message: string) {
  return /bucket|not found|does not exist|violates row-level security|row level security|policy|invalid key/i.test(message);
}

function sanitizeStoragePath(path: string) {
  return path
    .split("/")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "file")
    .join("/");
}

export async function uploadOrderAttachmentFile(path: string, file: File) {
  const safePath = sanitizeStoragePath(path);
  try {
    const primary = await uploadToStorage(STORAGE_BUCKETS.orderAttachments, safePath, file);
    return {
      error: null,
      data: { path: primary.path, publicUrl: primary.url, bucket: STORAGE_BUCKETS.orderAttachments }
    };
  } catch (primaryError) {
    if (!shouldFallbackToInspectionBucket((primaryError as { message?: string }).message ?? "")) {
      return { error: primaryError instanceof Error ? primaryError : new Error(String(primaryError)), data: null };
    }

    const fallbackPath = safePath.replace(/^([^/]+)\//, "$1/order-attachments/");
    try {
      const fallback = await uploadToStorage(STORAGE_BUCKETS.inspectionPhotos, fallbackPath, file);
      return {
        error: null,
        data: { path: fallback.path, publicUrl: fallback.url, bucket: STORAGE_BUCKETS.inspectionPhotos }
      };
    } catch (fallbackError) {
      return { error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)), data: null };
    }
  }
}

export async function insertOrderAttachments(attachments: OrderAttachmentInsert[]) {
  return apiRequest<unknown[]>("/api/order-attachments", {
    method: "POST",
    body: JSON.stringify({ attachments })
  });
}

export async function getOrderAttachments(orderId: string) {
  return apiRequest<unknown[]>(`/api/order-attachments?orderId=${encodeURIComponent(orderId)}`);
}
