import { supabase } from "@/src/api/client";
import { apiRequest } from "@/src/api/httpClient";
import { getOrderAttachments } from "@/src/api/orderAttachmentsApi";
import { getOrderById, getOrderItems } from "@/src/api/ordersApi";
import { STORAGE_BUCKETS } from "@/src/constants";
import type { Database, InspectionRecord, InspectionStage, ReinspectionRecord } from "@/src/types";

type InspectionRecordInsert = Database["public"]["Tables"]["inspection_records"]["Insert"];
type ReinspectionRecordInsert = Database["public"]["Tables"]["reinspection_records"]["Insert"];

export async function getInspectionRecords(orderId: string, stage?: InspectionStage, ascending = false) {
  const query = new URLSearchParams({ orderId, ascending: String(ascending) });
  if (stage) query.set("stage", stage);
  return apiRequest<InspectionRecord[]>(`/api/inspections?${query.toString()}`);
}

export async function insertInspectionRecord(record: InspectionRecordInsert) {
  return apiRequest<InspectionRecord>("/api/inspections", { method: "POST", body: JSON.stringify(record) });
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
  const query = new URLSearchParams({ orderId, ascending: String(ascending) });
  return apiRequest<ReinspectionRecord[]>(`/api/reinspections?${query.toString()}`);
}

export async function insertReinspectionRecord(record: ReinspectionRecordInsert) {
  return apiRequest<ReinspectionRecord>("/api/reinspections", { method: "POST", body: JSON.stringify(record) });
}

export async function getReinspectionPageData(orderId: string) {
  const [orderResult, recordsResult, reinspectionsResult] = await Promise.all([
    getOrderById(orderId),
    getInspectionRecords(orderId),
    getReinspectionRecords(orderId)
  ]);

  return {
    data: { order: orderResult.data, records: recordsResult.data ?? [], reinspections: reinspectionsResult.data ?? [] },
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
    data: { order: orderResult.data, records: recordsResult.data ?? [], reinspections: reinspectionsResult.data ?? [] },
    error: orderResult.error ?? recordsResult.error ?? reinspectionsResult.error
  };
}
