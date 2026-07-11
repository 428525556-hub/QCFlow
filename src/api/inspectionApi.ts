import { supabase } from "@/src/api/client";
import { STORAGE_BUCKETS } from "@/src/constants";
import { getOrderById, getOrderItems } from "@/src/api/ordersApi";
import { getOrderAttachments } from "@/src/api/orderAttachmentsApi";
import type { Database, InspectionStage } from "@/src/types";

type InspectionRecordInsert = Database["public"]["Tables"]["inspection_records"]["Insert"];
type ReinspectionRecordInsert = Database["public"]["Tables"]["reinspection_records"]["Insert"];

export async function getInspectionRecords(orderId: string, stage?: InspectionStage, ascending = false) {
  let query = supabase.from("inspection_records").select("*").eq("order_id", orderId).order("created_at", { ascending });
  if (stage) query = query.eq("inspection_stage", stage);
  return query;
}

export async function insertInspectionRecord(record: InspectionRecordInsert) {
  return supabase.from("inspection_records").insert(record).select("*").single();
}

export async function getInspectionWorkspaceData(orderId: string, stage: InspectionStage) {
  const [orderResult, itemsResult, recordsResult, attachmentsResult] = await Promise.all([
    getOrderById(orderId),
    getOrderItems(orderId),
    getInspectionRecords(orderId, stage),
    getOrderAttachments(orderId)
  ]);

  return {
    data: {
      order: orderResult.data,
      items: itemsResult.data ?? [],
      records: recordsResult.data ?? [],
      attachments: attachmentsResult.data ?? []
    },
    error: orderResult.error ?? itemsResult.error ?? recordsResult.error ?? attachmentsResult.error
  };
}

export async function uploadInspectionPhoto(path: string, file: File) {
  return supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
}

export function getInspectionPhotoPublicUrl(path: string) {
  return supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).getPublicUrl(path).data.publicUrl;
}

export async function getReinspectionRecords(orderId: string, ascending = false) {
  return supabase.from("reinspection_records").select("*").eq("order_id", orderId).order("created_at", { ascending });
}

export async function insertReinspectionRecord(record: ReinspectionRecordInsert) {
  return supabase.from("reinspection_records").insert(record).select("*").single();
}

export async function getReinspectionPageData(orderId: string) {
  const [orderResult, recordsResult, reinspectionsResult] = await Promise.all([
    getOrderById(orderId),
    getInspectionRecords(orderId),
    getReinspectionRecords(orderId)
  ]);

  return {
    data: {
      order: orderResult.data,
      records: recordsResult.data ?? [],
      reinspections: reinspectionsResult.data ?? []
    },
    error: orderResult.error ?? recordsResult.error ?? reinspectionsResult.error
  };
}

export async function getReportPageData(orderId: string) {
  const [orderResult, recordsResult, reinspectionsResult] = await Promise.all([
    getOrderById(orderId),
    getInspectionRecords(orderId, undefined, true),
    getReinspectionRecords(orderId, true)
  ]);

  return {
    data: {
      order: orderResult.data,
      records: recordsResult.data ?? [],
      reinspections: reinspectionsResult.data ?? []
    },
    error: orderResult.error ?? recordsResult.error ?? reinspectionsResult.error
  };
}
