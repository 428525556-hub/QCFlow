export type ImportInspectionPlan = "normal" | "xray" | "both" | "field";
export type ImportRowStatus = "ok" | "need_confirm" | "error";

export type CanonicalField =
  | "customerName"
  | "factoryName"
  | "poNumber"
  | "sku"
  | "quantityPerCarton"
  | "cartonCount"
  | "quantity"
  | "inboundDate"
  | "shippingDate"
  | "inspectionPlan"
  | "remark"
  | "reservationType"
  | "model"
  | "shoeType";

/** 单元格级追溯：每条数据都能回到 Excel 原始 Sheet/行/列 */
export type FieldTrace = {
  raw: unknown;
  parsed: string | number | null;
  sourceSheet: string;
  sourceRow: number;
  sourceColumn: number;
  mergedFrom?: { row: number; column: number };
};

export type RawImportCell = {
  value: unknown;
  column: number;
  mergedFrom?: { row: number; column: number };
};

export type RawImportRow = {
  rowNumber: number;
  sourceSheet: string;
  cells: Partial<Record<CanonicalField, RawImportCell>>;
};

export type ExcelImportRow = {
  rowNumber: number;
  sourceSheet: string;
  customerName: string;
  factoryName: string;
  poNumber: string;
  sku: string;
  color: string;
  size: string;
  quantityPerCarton: number | null;
  cartonCount: number | null;
  quantity: number | null;
  inboundDate: string | null;
  shippingDate: string | null;
  shippingDateTbd: boolean;
  inspectionPlan: ImportInspectionPlan;
  remark: string | null;
  directShip: boolean;
  status: ImportRowStatus;
  warnings: string[];
  errors: string[];
  duplicateInFile: boolean;
  maybeExisting: boolean;
  fields: Partial<Record<CanonicalField, FieldTrace>>;
};

export type ImportOrderPayload = {
  order_type: "reservation";
  customer_name: string;
  factory_name: string;
  po_number: string;
  sku: string;
  inbound_date: string | null;
  shipping_date: string | null;
  shipping_date_tbd: boolean;
  inspection_plan: ImportInspectionPlan;
  reservation_remark: string | null;
  color: string;
  size: string;
  quantity: number;
  inbound_quantity: number;
  status: "未开始";
  direct_ship: boolean;
};

export type ImportItemPayload = {
  po_number: string;
  sku: string;
  color: string;
  size: string;
  carton_count: number;
  quantity_per_carton: number;
  quantity: number;
  inbound_quantity: number;
};

export type ImportOrderGroup = {
  order: ImportOrderPayload;
  items: ImportItemPayload[];
  rowNumbers: number[];
};

const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  customerName: ["客户", "客户名", "客先", "客户名称", "customer", "customer name"],
  factoryName: ["工厂", "工厂名", "送货工厂", "工厂名称", "factory"],
  poNumber: ["订单号", "订单番号", "订单号码", "po", "po no", "order no", "order number", "注文番号"],
  sku: ["品番", "品号", "款号", "型号", "货号", "style", "style no", "品番（款号）"],
  quantityPerCarton: ["入数", "入数（双）", "入数(双)", "人数", "人数（双）", "人数(双)", "每箱数量", "箱入数", "每箱双数", "每箱入数", "一箱多少双"],
  cartonCount: ["订单箱数", "订单箱数（件）", "订单箱数(件)", "箱数", "箱数（件）", "箱数(件)", "订货箱数", "总箱数", "件数", "箱量", "箱", "cartons", "carton qty", "carton quantity", "ケース数"],
  quantity: ["订单数量", "订单数量（双）", "订单数量(双)", "总数量", "数量", "总数", "total qty", "総数", "总双数"],
  inboundDate: ["预约日期", "来货日期", "入库日期", "预约到货日期", "inbound date", "appointment date"],
  shippingDate: ["款柜日期", "做柜日期", "装柜日期", "上柜日期", "出货日期", "送货日期", "出货日", "出货时间", "交期", "交货日期", "交货日", "shipment date", "delivery date", "出荷日", "出荷予定日"],
  inspectionPlan: ["检验内容", "检品内容", "检验类型", "检品类型", "inspection", "inspection type"],
  remark: ["备注", "备注事项", "说明", "remark", "remarks"],
  reservationType: ["预约入库", "预约入库日", "入库类型", "入库方式", "直接出货", "出货方式"],
  model: ["材型", "モデル", "material", "model"],
  shoeType: ["鞋型", "シューズ", "shoe type", "shoes"]
};

function normalizeHeaderText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\s\u00A0\u3000]+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .toLowerCase();
}

function containsRule(header: string): CanonicalField | null {
  if (header.includes("入数") || header.includes("箱入")) return "quantityPerCarton";
  if (header.includes("箱数")) return "cartonCount";
  if (header.includes("订单数量") || header.includes("总数量") || header.includes("总数") || header.includes("総数")) return "quantity";
  if (header.includes("客户")) return "customerName";
  if (header.includes("工厂")) return "factoryName";
  if (header.includes("订单号") || header.includes("订单番号") || header.includes("po no") || header.includes("order no") || header.includes("注文番号")) return "poNumber";
  if (header.includes("品番") || header.includes("款号") || header.includes("货号") || header.includes("品号")) return "sku";
  if (header.includes("款柜") || header.includes("做柜") || header.includes("装柜") || header.includes("上柜") || header.includes("出货") || header.includes("送货") || header.includes("shipment") || header.includes("delivery") || header.includes("出荷")) return "shippingDate";
  if (header.includes("预约日期") || header.includes("来货") || header.includes("入库日期") || header.includes("inbound") || header.includes("appointment")) return "inboundDate";
  if (header.includes("检验") || header.includes("检品") || header.includes("inspection")) return "inspectionPlan";
  if (header.includes("材型") || header.includes("モデル")) return "model";
  if (header.includes("鞋型") || header.includes("シューズ") || header.includes("shoe")) return "shoeType";
  if (header.includes("备注") || header.includes("说明") || header.includes("remark")) return "remark";
  return null;
}

export function mapHeaderField(headerValue: unknown): CanonicalField | null {
  return mapHeaderFieldStrict(headerValue) ?? containsRule(normalizeHeaderText(headerValue));
}

export function mapHeaderFieldStrict(headerValue: unknown): CanonicalField | null {
  const header = normalizeHeaderText(headerValue);
  if (!header) return null;
  const fields = Object.keys(FIELD_ALIASES) as CanonicalField[];
  for (const field of fields) {
    if (FIELD_ALIASES[field].some((alias) => normalizeHeaderText(alias) === header)) return field;
  }
  return null;
}

export function mapHeaders(headers: unknown[]): Record<number, CanonicalField> {
  const best = new Map<CanonicalField, { index: number; strong: boolean }>();
  headers.forEach((header, index) => {
    const strongField = mapHeaderFieldStrict(header);
    const field = strongField ?? mapHeaderField(header);
    if (!field) return;
    const current = best.get(field);
    const strong = Boolean(strongField);
    if (!current || (strong && !current.strong)) {
      best.set(field, { index, strong });
    }
  });
  const result: Record<number, CanonicalField> = {};
  for (const [field, entry] of best.entries()) result[entry.index] = field;
  return result;
}

export function normalizeNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "object" && "result" in value) return normalizeNumber((value as { result: unknown }).result);
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const text = String(value).trim().replace(/[,，\s]/g, "").replace(/双|件|箱|對|对|pcs|prs|pair|pairs/gi, "");
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

export const SPECIAL_DATE_VALUES = /^(不出|未定|待定|暂无|无|n\/a|na|--|-{2,})$/i;
export const TBD_DATE_VALUES = /^(待定|未定)$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizeDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object" && "result" in value) return normalizeDate((value as { result: unknown }).result);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86400000);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  const yearFirst = text.match(/(\d{4})[\/\-\.年]\s*(\d{1,2})[\/\-\.月]\s*(\d{1,2})/);
  if (yearFirst) {
    const year = Number(yearFirst[1]);
    const month = Number(yearFirst[2]);
    const day = Number(yearFirst[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const twoDigitYear = text.match(/(\d{2})[\/\-\.年]\s*(\d{1,2})[\/\-\.月]\s*(\d{1,2})/);
  if (twoDigitYear) {
    const yy = Number(twoDigitYear[1]);
    const month = Number(twoDigitYear[2]);
    const day = Number(twoDigitYear[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = yy >= 50 ? 1900 + yy : 2000 + yy;
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const monthFirst = text.match(/^(\d{1,2})[\/\-\.]\s*(\d{1,2})[\/\-\.]\s*(\d{4})/);
  if (monthFirst) {
    const month = Number(monthFirst[1]);
    const day = Number(monthFirst[2]);
    const year = Number(monthFirst[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

export function mapInspectionPlan(value: unknown): { plan: ImportInspectionPlan; note?: string } {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return { plan: "both" };

  if (/出差|field/.test(text)) return { plan: "field" };

  const hasXray = /x线|x光|xray|検針|x-ray/.test(text);
  const hasNormal = /检品|検品/.test(text);
  if (hasXray && hasNormal) return { plan: "both" };
  if (hasXray) return { plan: "xray" };
  if (hasNormal) return { plan: "normal" };
  return { plan: "both", note: "检验内容无法识别，已按默认「检品+X线」处理，请人工确认" };
}

export function createEmptyRow(rowNumber: number, sourceSheet: string): ExcelImportRow {
  return {
    rowNumber,
    sourceSheet,
    customerName: "",
    factoryName: "",
    poNumber: "",
    sku: "",
    color: "未定",
    size: "未定",
    quantityPerCarton: null,
    cartonCount: null,
    quantity: null,
    inboundDate: null,
    shippingDate: null,
    shippingDateTbd: false,
    inspectionPlan: "both",
    remark: null,
    directShip: false,
    status: "ok",
    warnings: [],
    errors: [],
    duplicateInFile: false,
    maybeExisting: false,
    fields: {}
  };
}

function cellHasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && "result" in value) return cellHasValue((value as { result: unknown }).result);
  return String(value).trim() !== "";
}

function parseTextCell(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function appendRemark(row: ExcelImportRow, note: string): void {
  row.remark = row.remark ? `${row.remark}；${note}` : note;
}

export function buildRows(rawRows: RawImportRow[]): ExcelImportRow[] {
  const rows: ExcelImportRow[] = rawRows.map((raw) => {
    const row = createEmptyRow(raw.rowNumber, raw.sourceSheet);
    const issues: { errors: string[]; warnings: string[] } = { errors: [], warnings: [] };

    for (const [fieldName, cell] of Object.entries(raw.cells) as Array<[CanonicalField, RawImportCell]>) {
      const value = cell.value;
      const trace: FieldTrace = {
        raw: value,
        parsed: null,
        sourceSheet: raw.sourceSheet,
        sourceRow: raw.rowNumber,
        sourceColumn: cell.column,
        ...(cell.mergedFrom ? { mergedFrom: cell.mergedFrom } : {})
      };

      switch (fieldName) {
        case "customerName":
        case "factoryName":
        case "poNumber":
        case "sku": {
          const text = parseTextCell(value);
          row[fieldName] = text ?? "";
          trace.parsed = text;
          break;
        }
        case "remark": {
          const text = parseTextCell(value);
          trace.parsed = text;
          if (text) appendRemark(row, text);
          break;
        }
        case "quantityPerCarton":
        case "cartonCount":
        case "quantity": {
          const number = normalizeNumber(value);
          if (cellHasValue(value) && number == null) {
            issues.errors.push(`${fieldLabel(fieldName)}无法解析（原始值：${String(value).slice(0, 20)}）`);
          } else {
            row[fieldName] = number;
            trace.parsed = number;
          }
          break;
        }
        case "inboundDate":
        case "shippingDate": {
          if (cellHasValue(value)) {
            const text = String(value).trim();
            if (fieldName === "shippingDate" && TBD_DATE_VALUES.test(text)) {
              row.shippingDateTbd = true;
              appendRemark(row, `款柜日期：${text}`);
              trace.parsed = null;
            } else if (SPECIAL_DATE_VALUES.test(text)) {
              appendRemark(row, `${fieldName === "shippingDate" ? "款柜日期" : "预约日期"}：${text}`);
              trace.parsed = null;
            } else {
              const date = normalizeDate(value);
              row[fieldName] = date;
              trace.parsed = date;
              if (!date) issues.warnings.push(`${fieldLabel(fieldName)}无法识别（原始值：${text}），需人工确认`);
            }
          }
          break;
        }
        case "inspectionPlan": {
          const result = mapInspectionPlan(value);
          row.inspectionPlan = result.plan;
          trace.parsed = result.plan;
          if (result.note) issues.warnings.push(result.note);
          break;
        }
        case "reservationType": {
          const text = parseTextCell(value) ?? "";
          row.directShip = /直接|直出/.test(text);
          trace.parsed = text || null;
          break;
        }
        case "model": {
          const text = parseTextCell(value);
          trace.parsed = text;
          if (text) appendRemark(row, `材型：${text}`);
          break;
        }
        case "shoeType": {
          const text = parseTextCell(value);
          trace.parsed = text;
          if (text) appendRemark(row, `鞋型：${text}`);
          break;
        }
      }
      row.fields[fieldName] = trace;
    }

    validateRow(row);
    row.errors.push(...issues.errors);
    row.warnings.push(...issues.warnings);
    if (row.errors.length > 0) row.status = "error";
    else if (row.warnings.length > 0) row.status = "need_confirm";
    return row;
  });

  // 文件内重复行检测
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.poNumber || !row.sku || row.quantity == null) continue;
    const key = [row.customerName, row.poNumber, row.sku, row.quantity, row.shippingDate].join("|");
    if (seen.has(key)) {
      row.duplicateInFile = true;
      row.warnings.push(`与第 ${seen.get(key)} 行重复`);
      row.status = "need_confirm";
    } else {
      seen.set(key, row.rowNumber);
    }
  }

  return rows;
}

function fieldLabel(field: CanonicalField): string {
  const labels: Record<CanonicalField, string> = {
    customerName: "客户",
    factoryName: "工厂",
    poNumber: "订单号",
    sku: "品番",
    quantityPerCarton: "每箱数量",
    cartonCount: "箱数",
    quantity: "总数量",
    inboundDate: "预约日期",
    shippingDate: "出货/款柜日期",
    inspectionPlan: "检验内容",
    remark: "备注",
    reservationType: "预约入库类型",
    model: "材型",
    shoeType: "鞋型"
  };
  return labels[field];
}

export function validateRow(row: ExcelImportRow): void {
  row.errors = [];
  row.warnings = [];

  const required: Array<[keyof ExcelImportRow, string]> = [
    ["customerName", "缺少客户"],
    ["factoryName", "缺少工厂"],
    ["poNumber", "缺少订单号"],
    ["sku", "缺少品番"],
    ["quantityPerCarton", "缺少每箱数量（入数）"],
    ["cartonCount", "缺少箱数"],
    ["quantity", "缺少总数量"],
    ["inboundDate", "缺少预约日期"]
  ];
  for (const [key, label] of required) {
    const value = row[key];
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      row.warnings.push(`${label}（需确认）`);
    }
  }

  if (row.quantityPerCarton != null && (row.quantityPerCarton <= 0 || !Number.isInteger(row.quantityPerCarton))) {
    row.errors.push("每箱数量必须为正整数");
  }
  if (row.cartonCount != null && (row.cartonCount < 0 || !Number.isInteger(row.cartonCount))) {
    row.errors.push("箱数必须为不小于 0 的整数");
  }
  if (row.quantity != null && (row.quantity < 0 || !Number.isInteger(row.quantity))) {
    row.errors.push("总数量必须为不小于 0 的整数");
  }

  if (row.quantityPerCarton != null && row.cartonCount != null && row.quantity != null) {
    const expected = row.quantityPerCarton * row.cartonCount;
    if (expected !== row.quantity) {
      row.warnings.push(`数量不一致：入数×箱数 = ${expected} 双，Excel 总数量 = ${row.quantity} 双（人工确认后可导入）`);
    }
  }

  row.status = row.errors.length > 0 ? "error" : row.warnings.length > 0 ? "need_confirm" : "ok";
}

/**
 * 判断一行是否允许导入。
 * allowConfirm = true 表示人工已确认：仅「数量不一致 / 检验内容需确认」等
 * 非阻断性问题允许导入；缺必填字段、日期无法解析、文件内重复仍禁止导入。
 */
export function isRowImportable(row: ExcelImportRow, allowConfirm: boolean): boolean {
  if (row.status === "error") return false;
  if (row.status === "ok") return true;
  if (!allowConfirm) return false;
  if (row.duplicateInFile) return false;
  if (row.warnings.some((warning) => warning.includes("缺少"))) return false;
  if (row.warnings.some((warning) => warning.includes("无法识别"))) return false;
  return true;
}

export function buildOrderPayload(row: ExcelImportRow): ImportOrderPayload {
  return {
    order_type: "reservation",
    customer_name: row.customerName.trim(),
    factory_name: row.factoryName.trim(),
    po_number: row.poNumber.trim(),
    sku: row.sku.trim(),
    inbound_date: row.inboundDate,
    shipping_date: row.shippingDate,
    shipping_date_tbd: row.shippingDateTbd,
    inspection_plan: row.inspectionPlan,
    reservation_remark: row.remark?.trim() || null,
    color: row.color,
    size: row.size,
    quantity: row.quantity ?? 0,
    inbound_quantity: 0,
    status: "未开始",
    direct_ship: row.directShip
  };
}

export function buildItemPayload(row: ExcelImportRow): ImportItemPayload {
  return {
    po_number: row.poNumber.trim(),
    sku: row.sku.trim(),
    color: row.color,
    size: row.size,
    carton_count: row.cartonCount ?? 0,
    quantity_per_carton: row.quantityPerCarton ?? 10,
    quantity: row.quantity ?? 0,
    inbound_quantity: 0
  };
}

/**
 * 同一订单号（同客户/工厂）的多个品番明细合并为一个订单 + 多条明细，
 * 而不是为每一行单独创建订单。
 */
export function groupRowsIntoOrders(rows: ExcelImportRow[]): ImportOrderGroup[] {
  const groups = new Map<string, ExcelImportRow[]>();
  for (const row of rows) {
    const key = [row.customerName.trim(), row.factoryName.trim(), row.poNumber.trim()].join("|");
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const result: ImportOrderGroup[] = [];
  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    const items = groupRows.map(buildItemPayload);
    const remark = Array.from(new Set(groupRows.map((row) => row.remark?.trim()).filter(Boolean))).join("；") || null;
    result.push({
      order: {
        order_type: "reservation",
        customer_name: first.customerName.trim(),
        factory_name: first.factoryName.trim(),
        po_number: first.poNumber.trim(),
        sku: items[0].sku,
        inbound_date: first.inboundDate,
        shipping_date: first.shippingDate,
        shipping_date_tbd: first.shippingDateTbd,
        inspection_plan: first.inspectionPlan,
        reservation_remark: remark,
        color: first.color,
        size: first.size,
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        inbound_quantity: 0,
        status: "未开始",
        direct_ship: first.directShip
      },
      items,
      rowNumbers: groupRows.map((row) => row.rowNumber)
    });
  }
  return result;
}

export function summarizeRows(rows: ExcelImportRow[]) {
  return {
    total: rows.length,
    ok: rows.filter((row) => row.status === "ok").length,
    needConfirm: rows.filter((row) => row.status === "need_confirm").length,
    error: rows.filter((row) => row.status === "error").length,
    totalCartons: rows.reduce((sum, row) => sum + (row.cartonCount ?? 0), 0),
    totalQuantity: rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0)
  };
}
