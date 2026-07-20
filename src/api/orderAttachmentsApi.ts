import { STORAGE_BUCKETS } from "@/src/constants";
import { supabase } from "@/src/api/client";
import type { Database } from "@/src/types";

type OrderAttachmentInsert = Database["public"]["Tables"]["order_attachments"]["Insert"];

export function getOrderAttachmentPublicUrl(path: string) {
  return supabase.storage.from(STORAGE_BUCKETS.orderAttachments).getPublicUrl(path).data.publicUrl;
}

export async function uploadOrderAttachment(path: string, file: File) {
  return supabase.storage.from(STORAGE_BUCKETS.orderAttachments).upload(path, file, { cacheControl: "3600", upsert: false });
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
  const primary = await supabase.storage.from(STORAGE_BUCKETS.orderAttachments).upload(safePath, file, { cacheControl: "3600", upsert: false });

  if (!primary.error) {
    return {
      error: null,
      data: {
        path: safePath,
        publicUrl: supabase.storage.from(STORAGE_BUCKETS.orderAttachments).getPublicUrl(safePath).data.publicUrl,
        bucket: STORAGE_BUCKETS.orderAttachments
      }
    };
  }

  if (!shouldFallbackToInspectionBucket(primary.error.message)) {
    return { error: primary.error, data: null };
  }

  const fallbackPath = safePath.replace(/^([^/]+)\//, "$1/order-attachments/");
  const fallback = await supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).upload(fallbackPath, file, { cacheControl: "3600", upsert: false });

  if (fallback.error) {
    return { error: fallback.error, data: null };
  }

  return {
    error: null,
    data: {
      path: fallbackPath,
      publicUrl: supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).getPublicUrl(fallbackPath).data.publicUrl,
      bucket: STORAGE_BUCKETS.inspectionPhotos
    }
  };
}

export async function insertOrderAttachments(attachments: OrderAttachmentInsert[]) {
  return supabase.from("order_attachments").insert(attachments).select("*");
}

export async function getOrderAttachments(orderId: string) {
  return supabase.from("order_attachments").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
}
