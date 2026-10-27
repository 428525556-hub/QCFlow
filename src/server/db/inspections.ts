import type { InspectionRecord, InspectionStage, ReinspectionRecord } from "@/lib/types";

import { selectAll } from "./read.ts";

export type InspectionFilters = {
  orderId?: string | null;
  stage?: InspectionStage | null;
  ascending?: boolean;
};

export async function listInspectionRecords(filters: InspectionFilters = {}): Promise<InspectionRecord[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }
  if (filters.stage) {
    values.push(filters.stage);
    conditions.push(`inspection_stage = $${values.length}`);
  }

  return selectAll<InspectionRecord>("inspection_records", {
    conditions,
    values,
    orderBy: `created_at ${filters.ascending ? "asc" : "desc"}`
  });
}

export async function listReinspections(filters: { orderId?: string | null; ascending?: boolean } = {}): Promise<
  ReinspectionRecord[]
> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }

  return selectAll<ReinspectionRecord>("reinspection_records", {
    conditions,
    values,
    orderBy: `created_at ${filters.ascending ? "asc" : "desc"}`
  });
}
