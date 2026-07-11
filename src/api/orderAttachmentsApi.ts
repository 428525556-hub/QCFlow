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

export async function insertOrderAttachments(attachments: OrderAttachmentInsert[]) {
  return supabase.from("order_attachments").insert(attachments).select("*");
}

export async function getOrderAttachments(orderId: string) {
  return supabase.from("order_attachments").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
}
