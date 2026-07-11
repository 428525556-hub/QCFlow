import { percent } from "@/lib/format";
import { defectGroups, xrayDefectGroups } from "@/lib/types";
import type { InspectionRecord, Order, ReinspectionRecord } from "@/src/types";

export type FinalInspectionRecord = InspectionRecord & {
  recoveredQuantity: number;
  finalQuantity: number;
};

export type ReportDefectGroup = {
  group: string;
  quantity: number;
  items: Array<{ type: string; quantity: number }>;
};

export type ReportColorSizeRow = {
  color: string;
  size: string;
  defectType: string;
  quantity: number;
};

export type InspectionReportSummary = {
  total: number;
  defectQty: number;
  originalDefectQty: number;
  recoveredQty: number;
  confirmedFailedQty: number;
  grouped: ReportDefectGroup[];
  rate: string;
  finalRecordRows: FinalInspectionRecord[];
  colorSizeRows: ReportColorSizeRow[];
};

export function sumInspectionQuantity(records: InspectionRecord[]) {
  return records.reduce((sum, record) => sum + Number(record.quantity || 0), 0);
}

export function sumReinspectionPassed(records: ReinspectionRecord[]) {
  return records.reduce((sum, record) => sum + Number(record.passed_quantity || 0), 0);
}

export function buildInspectionReportSummary(order: Order | null, records: InspectionRecord[], reinspections: ReinspectionRecord[]): InspectionReportSummary {
  const total = order?.quantity ?? 0;
  const recoveredBySource = new Map<string, number>();
  for (const record of reinspections) {
    recoveredBySource.set(record.source_record_id, (recoveredBySource.get(record.source_record_id) ?? 0) + Number(record.passed_quantity || 0));
  }

  const originalDefectQty = records.reduce((sum, record) => sum + record.quantity, 0);
  const recoveredQty = sumReinspectionPassed(reinspections);
  const confirmedFailedQty = reinspections.reduce((sum, record) => sum + Number(record.failed_quantity || 0), 0);
  const defectQty = Math.max(0, originalDefectQty - recoveredQty);
  const adjustedQuantity = (record: InspectionRecord) => Math.max(0, Number(record.quantity || 0) - (recoveredBySource.get(record.id) ?? 0));

  const normalGrouped = defectGroups.map((group) => {
    const items = group.items.map((type) => ({
      type,
      quantity: records.filter((record) => record.inspection_stage !== "xray" && record.defect_type === type).reduce((sum, record) => sum + adjustedQuantity(record), 0)
    }));
    return {
      group: `検品-${group.group}`,
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items
    };
  });

  const xrayGrouped = xrayDefectGroups.map((group) => {
    const items = group.items.map((type) => ({
      type,
      quantity: records.filter((record) => record.inspection_stage === "xray" && record.defect_type === type).reduce((sum, record) => sum + adjustedQuantity(record), 0)
    }));
    return {
      group: `X線-${group.group}`,
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items
    };
  });

  const colorSizeRows = new Map<string, ReportColorSizeRow>();
  for (const record of records) {
    const color = record.color || "-";
    const size = record.size || "-";
    const key = `${color}__${size}__${record.defect_type}`;
    const row = colorSizeRows.get(key) ?? { color, size, defectType: record.defect_type, quantity: 0 };
    row.quantity += adjustedQuantity(record);
    colorSizeRows.set(key, row);
  }

  return {
    total,
    defectQty,
    originalDefectQty,
    recoveredQty,
    confirmedFailedQty,
    grouped: [...normalGrouped, ...xrayGrouped],
    rate: percent(defectQty, total),
    finalRecordRows: records.map((record) => ({
      ...record,
      recoveredQuantity: recoveredBySource.get(record.id) ?? 0,
      finalQuantity: adjustedQuantity(record)
    })),
    colorSizeRows: Array.from(colorSizeRows.values())
      .filter((row) => row.quantity > 0)
      .sort((a, b) => a.color.localeCompare(b.color, "zh-Hans-CN") || a.size.localeCompare(b.size, "zh-Hans-CN", { numeric: true }))
  };
}

export const reportService = {
  sumInspectionQuantity,
  sumReinspectionPassed,
  buildInspectionReportSummary
};
