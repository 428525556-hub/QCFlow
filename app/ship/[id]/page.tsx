"use client";

import { findMissingCartonNos, sortByCartonNo } from "@/lib/cartonNumbers";
import { updateOrder } from "@/src/api/ordersApi";
import { deleteShipmentCarton, getShipmentOrderData, insertShipmentCarton, insertShipmentItems } from "@/src/api/shipmentApi";
import { getCurrentUser } from "@/src/api/userApi";
import type { Order, OrderItem, ShipmentCarton, ShipmentItem, UnboxingRecord } from "@/lib/types";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Package, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CartonWithItems = ShipmentCarton & {
  items: ShipmentItem[];
};

type DraftRow = {
  id: string;
  color: string;
  size: string;
  quantity: number;
};

type UnboxedSkuProgress = {
  key: string;
  color: string;
  size: string;
  openedCartons: number;
  packedCartons: number;
  pendingCartons: number;
  openedQuantity: number;
  packedQuantity: number;
  pendingQuantity: number;
};

function newDraftRow(items: OrderItem[]): DraftRow {
  const first = items[0];
  return {
    id: crypto.randomUUID(),
    color: first?.color ?? "",
    size: first?.size ?? "",
    quantity: 10
  };
}

function itemKey(color: string, size: string) {
  return `${color}|||${size}`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safePdfText(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, "?");
}

export default function ShipOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [cartons, setCartons] = useState<CartonWithItems[]>([]);
  const [unboxingRecords, setUnboxingRecords] = useState<UnboxingRecord[]>([]);
  const [cartonNo, setCartonNo] = useState("");
  const [remark, setRemark] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const pendingScrollCartonNoRef = useRef<string | null>(null);
  const unboxedCartonRefs = useRef(new Map<string, HTMLButtonElement>());

  const load = useCallback(async function loadShipment(showLoading = true) {
    if (showLoading) setLoading(true);
    const { data } = await getShipmentOrderData(orderId);

    const orderItems = (data.items ?? []) as OrderItem[];
    const shipmentItems = (data.shipmentItems ?? []) as ShipmentItem[];
    setOrder((data.order ?? null) as Order | null);
    setItems(orderItems);
    setUnboxingRecords((data.unboxingRecords ?? []) as UnboxingRecord[]);
    setRows((current) => (current.length > 0 ? current : [newDraftRow(orderItems)]));
    setCartons(
      ((data.cartons ?? []) as ShipmentCarton[]).map((carton) => ({
        ...carton,
        items: shipmentItems.filter((item) => item.carton_id === carton.id)
      }))
    );
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const resolveItemIdentity = useCallback(
    (source: { po_number: string; sku: string; color: string; size: string; quantity?: number }) => {
      const byPoSkuSize = items.find((item) => item.po_number === source.po_number && item.sku === source.sku && item.size === source.size);
      if (byPoSkuSize) return { color: byPoSkuSize.color, size: byPoSkuSize.size };

      const byPoSkuColorQuantity = items.find(
        (item) =>
          item.po_number === source.po_number &&
          item.sku === source.sku &&
          item.color === source.color &&
          Number(item.quantity_per_carton || 0) === Number(source.quantity || 0)
      );
      if (byPoSkuColorQuantity) return { color: byPoSkuColorQuantity.color, size: byPoSkuColorQuantity.size };

      const byPoSkuColor = items.find((item) => item.po_number === source.po_number && item.sku === source.sku && item.color === source.color);
      if (byPoSkuColor) return { color: byPoSkuColor.color, size: byPoSkuColor.size };

      const byColorSize = items.find((item) => item.color === source.color && item.size === source.size);
      if (byColorSize) return { color: byColorSize.color, size: byColorSize.size };

      return { color: source.color, size: source.size };
    },
    [items]
  );

  const normalizedCartons = useMemo<CartonWithItems[]>(
    () =>
      cartons.map((carton) => ({
        ...carton,
        items: carton.items.map((item) => {
          const identity = resolveItemIdentity({ po_number: item.po_number, sku: item.sku, color: item.color, size: item.size, quantity: item.quantity });
          return { ...item, color: identity.color, size: identity.size };
        })
      })),
    [cartons, resolveItemIdentity]
  );

  const colors = useMemo(() => Array.from(new Set(items.map((item) => item.color))).filter(Boolean), [items]);
  const sortedCartons = useMemo(() => sortByCartonNo(normalizedCartons), [normalizedCartons]);
  const missingCartonNos = useMemo(() => findMissingCartonNos(normalizedCartons.map((carton) => carton.carton_no)), [normalizedCartons]);

  const shippedBySku = useMemo(() => {
    const map = new Map<string, number>();
    for (const carton of normalizedCartons) {
      for (const item of carton.items) {
        const key = itemKey(item.color, item.size);
        map.set(key, (map.get(key) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [normalizedCartons]);

  const itemSummary = useMemo(() => {
    return items.map((item) => {
      const available = Number(item.inbound_quantity || item.quantity || 0);
      const shipped = shippedBySku.get(itemKey(item.color, item.size)) ?? 0;
      return {
        ...item,
        available,
        shipped,
        remaining: Math.max(0, available - shipped)
      };
    });
  }, [items, shippedBySku]);

  const normalizedUnboxingRecords = useMemo(
    () =>
      unboxingRecords.map((record) => {
        const identity = resolveItemIdentity({ po_number: record.po_number, sku: record.sku, color: record.color, size: record.size, quantity: record.quantity });
        return {
          ...record,
          color: identity.color,
          size: identity.size
        };
      }),
    [resolveItemIdentity, unboxingRecords]
  );

  const packedQuantityByCartonNo = useMemo(() => {
    const map = new Map<string, number>();
    for (const carton of normalizedCartons) {
      const cartonQuantity = carton.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      map.set(carton.carton_no.trim(), (map.get(carton.carton_no.trim()) ?? 0) + cartonQuantity);
    }
    return map;
  }, [normalizedCartons]);

  const unboxedCartonGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        cartonNo: string;
        quantity: number;
        shortage: number;
        records: UnboxingRecord[];
        packedQuantity: number;
        packed: boolean;
      }
    >();

    for (const record of normalizedUnboxingRecords) {
      const nextCartonNo = record.carton_no.trim();
      if (!nextCartonNo) continue;
      const current =
        map.get(nextCartonNo) ??
        {
          cartonNo: nextCartonNo,
          quantity: 0,
          shortage: 0,
          records: [],
          packedQuantity: 0,
          packed: false
        };
      current.quantity += Number(record.quantity || 0);
      current.shortage += Number(record.shortage_quantity || 0);
      current.records.push(record);
      map.set(nextCartonNo, current);
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        packedQuantity: packedQuantityByCartonNo.get(group.cartonNo) ?? 0,
        packed: packedQuantityByCartonNo.has(group.cartonNo)
      }))
      .sort((a, b) => {
        if (a.packed !== b.packed) return a.packed ? 1 : -1;
        return a.cartonNo.localeCompare(b.cartonNo, "zh-Hans-CN", { numeric: true });
      });
  }, [normalizedUnboxingRecords, packedQuantityByCartonNo]);

  const unboxedStats = useMemo(() => {
    const opened = unboxedCartonGroups.length;
    const packed = unboxedCartonGroups.filter((group) => group.packed).length;
    return { opened, packed, pending: opened - packed };
  }, [unboxedCartonGroups]);

  useEffect(() => {
    const cartonNoToScroll = pendingScrollCartonNoRef.current;
    if (!cartonNoToScroll) return;

    const target = unboxedCartonRefs.current.get(cartonNoToScroll);
    if (!target) return;

    pendingScrollCartonNoRef.current = null;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [unboxedCartonGroups]);

  const unboxedSkuProgress = useMemo<UnboxedSkuProgress[]>(() => {
    const map = new Map<
      string,
      {
        color: string;
        size: string;
        openedCartonNos: Set<string>;
        packedCartonNos: Set<string>;
        pendingCartonNos: Set<string>;
        openedQuantity: number;
        packedQuantity: number;
        pendingQuantity: number;
      }
    >();

    for (const record of normalizedUnboxingRecords) {
      const cartonKey = record.carton_no.trim();
      if (!cartonKey) continue;

      const key = itemKey(record.color, record.size);
      const current =
        map.get(key) ??
        ({
          color: record.color,
          size: record.size,
          openedCartonNos: new Set<string>(),
          packedCartonNos: new Set<string>(),
          pendingCartonNos: new Set<string>(),
          openedQuantity: 0,
          packedQuantity: 0,
          pendingQuantity: 0
        });
      const quantity = Number(record.quantity || 0);
      const packed = packedQuantityByCartonNo.has(cartonKey);

      current.openedCartonNos.add(cartonKey);
      current.openedQuantity += quantity;
      if (packed) {
        current.packedCartonNos.add(cartonKey);
        current.packedQuantity += quantity;
      } else {
        current.pendingCartonNos.add(cartonKey);
        current.pendingQuantity += quantity;
      }
      map.set(key, current);
    }

    return Array.from(map.entries())
      .map(([key, row]) => ({
        key,
        color: row.color,
        size: row.size,
        openedCartons: row.openedCartonNos.size,
        packedCartons: row.packedCartonNos.size,
        pendingCartons: row.pendingCartonNos.size,
        openedQuantity: row.openedQuantity,
        packedQuantity: row.packedQuantity,
        pendingQuantity: row.pendingQuantity
      }))
      .sort((a, b) => a.color.localeCompare(b.color, "zh-Hans-CN") || a.size.localeCompare(b.size, "zh-Hans-CN", { numeric: true }));
  }, [normalizedUnboxingRecords, packedQuantityByCartonNo]);

  const selectedUnboxedGroup = useMemo(() => unboxedCartonGroups.find((group) => group.cartonNo === cartonNo.trim()) ?? null, [cartonNo, unboxedCartonGroups]);
  const existingCartonForEditor = useMemo(() => normalizedCartons.find((carton) => carton.carton_no.trim() === cartonNo.trim()) ?? null, [cartonNo, normalizedCartons]);

  const totals = useMemo(() => {
    const planned = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const inbound = items.reduce((sum, item) => sum + Number(item.inbound_quantity || 0), 0);
    const shipped = normalizedCartons.reduce((sum, carton) => sum + carton.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const base = inbound > 0 ? inbound : planned;
    return { planned, inbound, shipped, remaining: Math.max(0, base - shipped) };
  }, [items, normalizedCartons]);

  function sizesForColor(color: string) {
    return itemSummary
      .filter((item) => item.color === color)
      .sort((a, b) => a.size.localeCompare(b.size, "zh-Hans-CN", { numeric: true }))
      .map((item) => item.size);
  }

  function updateRow(rowId: string, patch: Partial<DraftRow>) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, ...patch };
        if (patch.color && patch.color !== row.color) {
          next.size = sizesForColor(patch.color)[0] ?? "";
        }
        return next;
      })
    );
  }

  function addRow() {
    setRows((current) => [...current, newDraftRow(items)]);
  }

  function removeRow(rowId: string) {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== rowId)));
  }

  function setRowQuantity(rowId: string, quantity: number) {
    updateRow(rowId, { quantity });
  }

  function applyUnboxedCarton(nextCartonNo: string) {
    const matchedRecords = normalizedUnboxingRecords.filter((record) => record.carton_no.trim() === nextCartonNo);
    setCartonNo(nextCartonNo);
    if (matchedRecords.length === 0) return;

    const bySku = new Map<string, DraftRow>();
    for (const record of matchedRecords) {
      const key = itemKey(record.color, record.size);
      const current = bySku.get(key);
      if (current) {
        current.quantity += Number(record.quantity || 0);
      } else {
        bySku.set(key, {
          id: crypto.randomUUID(),
          color: record.color,
          size: record.size,
          quantity: Number(record.quantity || 0)
        });
      }
    }

    const nextRows = Array.from(bySku.values()).filter((row) => row.color && row.size && row.quantity > 0);
    if (nextRows.length > 0) setRows(nextRows);
    const notes = Array.from(new Set(matchedRecords.map((record) => record.remark).filter(Boolean)));
    if (notes.length > 0) setRemark(notes.join(" / "));
    setEditorOpen(true);
  }

  function openManualEditor() {
    setCartonNo("");
    setRemark("");
    setRows([newDraftRow(items)]);
    setEditorOpen(true);
  }

  function isShortPacked(group: { quantity: number; shortage: number; packedQuantity: number; packed: boolean }) {
    return group.packed && (group.shortage > 0 || group.packedQuantity < group.quantity || group.packedQuantity < 10);
  }

  async function saveCarton(closeAfterSave = false) {
    if (!order) return false;
    setMessage("");
    setMessageType("error");

    const cleanCartonNo = cartonNo.trim();
    const cleanRows = rows.filter((row) => row.color && row.size && Number(row.quantity) > 0);
    if (!cleanCartonNo) {
      setMessage("请先输入箱号。");
      return false;
    }
    if (cleanRows.length === 0) {
      setMessage("请至少填写一行颜色、尺码和数量。");
      return false;
    }
    if (cartons.some((carton) => carton.carton_no.trim() === cleanCartonNo)) {
      setMessage("这个箱号已经装箱过了，请选择其他箱号，或先删除原来的装箱记录。");
      return false;
    }

    const hasUnboxingCartons = unboxedCartonGroups.length > 0;
    const existsInUnboxing = unboxedCartonGroups.some((group) => group.cartonNo === cleanCartonNo);
    if (hasUnboxingCartons && !existsInUnboxing) {
      const ok = window.confirm("这个箱号不在开箱记录里，确认作为额外箱号装箱吗？");
      if (!ok) return false;
    }

    const draftBySku = new Map<string, number>();
    for (const row of cleanRows) {
      const key = itemKey(row.color, row.size);
      draftBySku.set(key, (draftBySku.get(key) ?? 0) + Number(row.quantity || 0));
    }

    for (const [key, qty] of draftBySku.entries()) {
      const summary = itemSummary.find((item) => itemKey(item.color, item.size) === key);
      if (!summary) {
        setMessage("颜色或尺码不在这个订单里，请重新选择。");
        return false;
      }
      if (!existsInUnboxing && qty > summary.remaining) {
        setMessage(`${summary.color} / ${summary.size} 本次装箱 ${qty}，超过剩余 ${summary.remaining}。`);
        return false;
      }
    }

    setSaving(true);
    const { data: session } = await getCurrentUser();
    const userId = session.user?.id;
    if (!userId) {
      setMessage("登录状态已失效，请重新登录。");
      setSaving(false);
      return false;
    }

    const { data: carton, error: cartonError } = await insertShipmentCarton({
      order_id: order.id,
      user_id: userId,
      carton_no: cleanCartonNo,
      remark: remark.trim() || null
    });

    if (cartonError || !carton) {
      setMessage(`${cartonError?.message ?? "保存箱号失败"}。请确认 Supabase 已执行最新 schema.sql。`);
      setSaving(false);
      return false;
    }

    const shipmentRows = cleanRows.map((row) => {
      const matched = items.find((item) => item.color === row.color && item.size === row.size);
      return {
        carton_id: carton.id,
        order_id: order.id,
        user_id: userId,
        po_number: matched?.po_number || order.po_number,
        sku: matched?.sku || order.sku,
        color: row.color,
        size: row.size,
        quantity: Number(row.quantity)
      };
    });

    const { error: itemError } = await insertShipmentItems(shipmentRows);
    if (itemError) {
      await deleteShipmentCarton(carton.id);
      setMessage(`${itemError.message}。请确认 Supabase 已执行最新 schema.sql。`);
      setSaving(false);
      return false;
    }

    setCartonNo("");
    setRemark("");
    setRows([newDraftRow(items)]);
    pendingScrollCartonNoRef.current = cleanCartonNo;
    await load(false);
    if (closeAfterSave) setEditorOpen(false);
    setSaving(false);
    return true;
  }

  async function deleteCarton(cartonId: string) {
    const ok = window.confirm("确定删除这个箱号和里面的装箱明细吗？");
    if (!ok) return;

    setMessage("");
    setMessageType("error");
    const { error } = await deleteShipmentCarton(cartonId);
    if (error) {
      setMessage(`${error.message}。请确认 Supabase 已执行最新 schema.sql。`);
      return;
    }
    setCartons((current) => current.filter((carton) => carton.id !== cartonId));
  }

  async function restoreCartonToPacking(carton: CartonWithItems) {
    const cleanCartonNo = carton.carton_no.trim();
    const ok = window.confirm(`确定把箱号 ${cleanCartonNo} 恢复为未装箱，并重新打开装箱窗口吗？`);
    if (!ok) return;

    setMessage("");
    setMessageType("error");
    const { error } = await deleteShipmentCarton(carton.id);
    if (error) {
      setMessage(`${error.message}。恢复失败，请确认 Supabase 已执行最新 schema.sql。`);
      return;
    }

    setCartons((current) => current.filter((item) => item.id !== carton.id));
    window.setTimeout(() => applyUnboxedCarton(cleanCartonNo), 0);
  }

  async function finishShipment() {
    if (!order) return;
    if (finishing) return;

    setMessage("");
    setMessageType("error");

    if (cartons.length === 0) {
      setMessage("还没有装箱箱号，不能完成装箱。");
      return;
    }

    if (missingCartonNos.length > 0) {
      const ok = window.confirm(`当前箱号中间缺少：${missingCartonNos.join("、")}。确认仍然完成装箱吗？`);
      if (!ok) return;
    }

    if (unboxedStats.pending > 0) {
      const ok = window.confirm(`还有 ${unboxedStats.pending} 个开箱箱号未装箱。确认仍然完成装箱吗？`);
      if (!ok) return;
    }

    setFinishing(true);
    try {
      const { error } = await updateOrder(order.id, { status: "已完成" });
      if (error) {
        setMessage(error.message || "完成装箱失败，请重新点击一次。");
        return;
      }
      setOrder({ ...order, status: "已完成" });
      setMessageType("success");
      setMessage("装箱已完成，订单状态已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "完成装箱失败，请重新点击一次。");
    } finally {
      setFinishing(false);
    }
  }

  function exportShipmentDetail() {
    if (!order) return;

    const orderedCartons = sortedCartons;
    const allItems = orderedCartons.flatMap((carton) =>
      carton.items.map((item) => ({
        cartonNo: carton.carton_no,
        remark: carton.remark ?? "",
        poNumber: item.po_number,
        sku: item.sku,
        color: item.color,
        size: item.size,
        quantity: item.quantity
      }))
    );
    const sizes = Array.from(new Set(allItems.map((item) => item.size).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));

    const packingRows = new Map<
      string,
      {
        cartonNo: string;
        remark: string;
        poNumber: string;
        sku: string;
        color: string;
        sizes: Map<string, number>;
      }
    >();
    for (const item of allItems) {
      const key = [item.cartonNo, item.poNumber, item.sku, item.color].join("|||");
      const row =
        packingRows.get(key) ??
        ({
          cartonNo: item.cartonNo,
          remark: item.remark,
          poNumber: item.poNumber,
          sku: item.sku,
          color: item.color,
          sizes: new Map<string, number>()
        } as const);
      row.sizes.set(item.size, (row.sizes.get(item.size) ?? 0) + item.quantity);
      packingRows.set(key, row);
    }

    const summaryRows = new Map<string, { poNumber: string; sku: string; color: string; size: string; quantity: number }>();
    for (const item of allItems) {
      const key = [item.poNumber, item.sku, item.color, item.size].join("|||");
      const row = summaryRows.get(key) ?? { poNumber: item.poNumber, sku: item.sku, color: item.color, size: item.size, quantity: 0 };
      row.quantity += item.quantity;
      summaryRows.set(key, row);
    }

    const cell = (value: string | number | null | undefined, mergeAcross = 0, styleId?: string) =>
      `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}${mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : ""}><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${escapeHtml(value ?? "")}</Data></Cell>`;
    const rowXml = (cells: string[]) => `<Row>${cells.join("")}</Row>`;
    const blank = (count: number) => Array.from({ length: count }, () => cell(""));

    const sizeHeader = sizes.length > 0 ? sizes.map((size) => cell(size, 0, "Header")) : [cell("SIZE", 0, "Header")];
    const packingDataRows =
      Array.from(packingRows.values())
        .map((row) => {
          const rowTotal = sizes.reduce((sum, size) => sum + (row.sizes.get(size) ?? 0), 0);
          return rowXml([
            cell(row.cartonNo, 0, "Border"),
            cell(1, 0, "Border"),
            cell(row.poNumber, 0, "Border"),
            cell(row.sku, 0, "Border"),
            cell(row.color, 0, "Border"),
            ...sizes.map((size) => cell(row.sizes.get(size) || "", 0, "Border")),
            cell(rowTotal, 0, "Border"),
            cell(rowTotal, 0, "Border"),
            cell(row.remark, 0, "Border")
          ]);
        })
        .join("") || rowXml([cell("暂无装箱明细", 8 + Math.max(sizes.length, 1), "Border")]);

    const packingColumnCount = 8 + Math.max(sizes.length, 1);
    const summaryDataRows =
      Array.from(summaryRows.values())
        .sort((a, b) => a.color.localeCompare(b.color, "zh-Hans-CN") || a.size.localeCompare(b.size, "zh-Hans-CN", { numeric: true }))
        .map((row) => rowXml([cell(order.customer_name, 0, "Border"), cell(row.poNumber, 0, "Border"), cell(row.sku, 0, "Border"), cell(row.color, 0, "Border"), cell(row.size, 0, "Border"), cell(row.quantity, 0, "Border"), cell("", 0, "Border")]))
        .join("") || rowXml([cell("暂无汇总", 6, "Border")]);

    const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Alignment ss:Horizontal="Center"/></Style>
    <Style ss:ID="SubTitle"><Font ss:Bold="1" ss:Size="12"/><Alignment ss:Horizontal="Center"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Border"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
    <Style ss:ID="Meta"><Font ss:Bold="1"/><Alignment ss:Horizontal="Left"/></Style>
  </Styles>
  <Worksheet ss:Name="装箱统计">
    <Table>
      ${rowXml([cell("装箱统计", 6, "Title")])}
      ${rowXml([cell("客户名称", 0, "Meta"), cell(order.customer_name, 2), cell("工厂名称", 0, "Meta"), cell(order.factory_name, 2)])}
      ${rowXml([cell("订单号", 0, "Meta"), cell(order.po_number, 2), cell("番号", 0, "Meta"), cell(order.sku, 2)])}
      ${rowXml([cell("出货日期", 0, "Meta"), cell(order.shipping_date ?? "", 2), cell("装箱箱数", 0, "Meta"), cell(orderedCartons.length), cell("装箱双数", 0, "Meta"), cell(totals.shipped)])}
      ${rowXml([cell("客户", 0, "Header"), cell("订单号", 0, "Header"), cell("番号", 0, "Header"), cell("颜色", 0, "Header"), cell("尺码", 0, "Header"), cell("装箱双数", 0, "Header"), cell("备注", 0, "Header")])}
      ${summaryDataRows}
      ${rowXml([cell("合计", 4, "Header"), cell(totals.shipped, 0, "Header"), cell("", 0, "Header")])}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="packing list">
    <Table>
      ${rowXml([cell("SHUOYU SHOES CO., LTD.", packingColumnCount, "Title")])}
      ${rowXml([cell("packing list", packingColumnCount, "SubTitle")])}
      ${rowXml(blank(packingColumnCount + 1))}
      ${rowXml([cell("FACTORY NAME(工厂名称)", 1, "Meta"), cell(order.factory_name, 2), cell("ORDER.NO(订单NO)", 1, "Meta"), cell(order.po_number, 2), cell("TOTAL", 0, "Header"), cell(totals.shipped, 0, "Header")])}
      ${rowXml([cell("CTN No", 0, "Header"), cell("CTNS", 0, "Header"), cell("ORD No", 0, "Header"), cell("ART No", 0, "Header"), cell("COLOUR", 0, "Header"), cell("SIZE（尺码）", Math.max(sizes.length - 1, 0), "Header"), cell("PRS", 0, "Header"), cell("TOTAL PRS", 0, "Header"), cell("备注", 0, "Header")])}
      ${rowXml([cell("箱号", 0, "Header"), cell("箱数", 0, "Header"), cell("订单号", 0, "Header"), cell("品番", 0, "Header"), cell("颜色", 0, "Header"), ...sizeHeader, cell("每箱/双数", 0, "Header"), cell("总双数", 0, "Header"), cell("备注", 0, "Header")])}
      ${packingDataRows}
      ${rowXml([cell("合计", 0, "Header"), cell(orderedCartons.length, 0, "Header"), ...blank(3 + Math.max(sizes.length, 1)), cell(totals.shipped, 0, "Header"), cell(totals.shipped, 0, "Header"), cell("", 0, "Header")])}
    </Table>
  </Worksheet>
</Workbook>`;

    const blob = new Blob(["\ufeff", workbookXml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.po_number || "装箱明细"}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadShipmentPdf() {
    if (!order) return;
    const currentOrder = order;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF("landscape", "mm", "a4");

    const orderedCartons = sortedCartons;
    const allItems = orderedCartons.flatMap((carton) =>
      carton.items.map((item) => ({
        cartonNo: carton.carton_no,
        remark: carton.remark ?? "",
        poNumber: item.po_number,
        sku: item.sku,
        color: item.color,
        size: item.size,
        quantity: item.quantity
      }))
    );
    const sizes = Array.from(new Set(allItems.map((item) => item.size).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
    const displaySizes = sizes.slice(0, 10);

    const packingRows = new Map<
      string,
      {
        cartonNo: string;
        ctns: number;
        poNumber: string;
        sku: string;
        color: string;
        sizes: Map<string, number>;
        remark: string;
      }
    >();

    for (const item of allItems) {
      const key = [item.cartonNo, item.poNumber, item.sku, item.color].join("|||");
      const row =
        packingRows.get(key) ??
        ({
          cartonNo: item.cartonNo,
          ctns: 1,
          poNumber: item.poNumber,
          sku: item.sku,
          color: item.color,
          sizes: new Map<string, number>(),
          remark: item.remark
        } as const);
      row.sizes.set(item.size, (row.sizes.get(item.size) ?? 0) + item.quantity);
      packingRows.set(key, row);
    }

    const summaryRows = new Map<string, { color: string; sizes: Map<string, number>; total: number }>();
    for (const item of allItems) {
      const row = summaryRows.get(item.color) ?? { color: item.color, sizes: new Map<string, number>(), total: 0 };
      row.sizes.set(item.size, (row.sizes.get(item.size) ?? 0) + item.quantity);
      row.total += item.quantity;
      summaryRows.set(item.color, row);
    }

    const pageWidth = 2970;
    const pageHeight = 2100;
    const margin = 120;
    const tableWidth = pageWidth - margin * 2;
    const fontFamily = '"Microsoft YaHei", "Yu Gothic", "Meiryo", "Noto Sans CJK SC", Arial, sans-serif';
    const rows = Array.from(packingRows.values());
    const rowsPerPage = 24;
    const sizeColumnWidth = Math.max(92, Math.min(140, Math.floor(920 / Math.max(displaySizes.length, 1))));
    const widths = [250, 120, 320, 270, 250, ...displaySizes.map(() => sizeColumnWidth), 190, 190, 260];
    const summaryWidths = [360, ...displaySizes.map(() => sizeColumnWidth), 220];

    function createPage() {
      const canvas = document.createElement("canvas");
      canvas.width = pageWidth;
      canvas.height = pageHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF canvas unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageWidth, pageHeight);
      context.textBaseline = "middle";
      return { canvas, context };
    }

    function setFont(context: CanvasRenderingContext2D, size: number, bold = false) {
      context.font = `${bold ? 700 : 400} ${size}px ${fontFamily}`;
    }

    function text(context: CanvasRenderingContext2D, value: string | number, x: number, y: number, options?: { align?: CanvasTextAlign; bold?: boolean; size?: number }) {
      setFont(context, options?.size ?? 34, options?.bold ?? false);
      context.fillStyle = "#000000";
      context.textAlign = options?.align ?? "left";
      context.fillText(String(value ?? ""), x, y);
    }

    function drawCell(context: CanvasRenderingContext2D, value: string | number, x: number, y: number, width: number, height: number, options?: { fill?: string; bold?: boolean; align?: CanvasTextAlign; size?: number }) {
      if (options?.fill) {
        context.fillStyle = options.fill;
        context.fillRect(x, y, width, height);
      }
      context.strokeStyle = "#4b5563";
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
      setFont(context, options?.size ?? 29, options?.bold ?? false);
      context.fillStyle = "#000000";
      context.textAlign = options?.align ?? "center";
      const textX = options?.align === "left" ? x + 12 : options?.align === "right" ? x + width - 12 : x + width / 2;
      const clipped = String(value ?? "");
      context.fillText(clipped.length > 22 ? `${clipped.slice(0, 21)}...` : clipped, textX, y + height / 2);
    }

    function drawHeader(context: CanvasRenderingContext2D) {
      text(context, "SHUOYU SHOES CO., LTD.", pageWidth / 2, 105, { align: "center", bold: true, size: 44 });
      text(context, "packing list", pageWidth / 2, 165, { align: "center", bold: true, size: 38 });
      text(context, `FACTORY NAME(工厂名称): ${currentOrder.factory_name}`, margin, 280, { bold: true, size: 30 });
      text(context, `ORDER.NO(订单NO): ${currentOrder.po_number}`, margin + 900, 280, { bold: true, size: 30 });
      text(context, `TOTAL: ${totals.shipped}`, margin + 1850, 280, { bold: true, size: 30 });
      text(context, `CUSTOMER(客户): ${currentOrder.customer_name}`, margin, 340, { bold: true, size: 30 });
      text(context, `ART No(品番): ${currentOrder.sku}`, margin + 900, 340, { bold: true, size: 30 });
      text(context, `出货日期 ${currentOrder.shipping_date ?? "-"}`, margin + 1850, 340, { bold: true, size: 30 });
    }

    function drawRow(context: CanvasRenderingContext2D, cells: Array<string | number>, y: number, rowHeight: number, fill?: string, bold = false) {
      let x = margin;
      cells.forEach((cell, index) => {
        drawCell(context, cell, x, y, widths[index], rowHeight, { fill, bold, size: bold ? 27 : 28 });
        x += widths[index];
      });
    }

    function addCanvasPage(canvas: HTMLCanvasElement, isFirstPage: boolean) {
      if (!isFirstPage) pdf.addPage("a4", "landscape");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 297, 210);
    }

    const pages = Math.max(1, Math.ceil(Math.max(rows.length, 1) / rowsPerPage));
    for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
      const { canvas, context } = createPage();
      drawHeader(context);
      let y = 430;
      drawRow(context, ["CTN No", "CTNS", "ORD No", "ART No", "COLOUR", ...displaySizes, "PRS", "PRS", "备注"], y, 70, "#d9eaf7", true);
      y += 70;
      drawRow(context, ["箱号", "箱", "订单号", "品番", "颜色", ...displaySizes, "每箱/双数", "总双数", ""], y, 70, "#d9eaf7", true);
      y += 70;

      const pageRows = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
      if (pageRows.length === 0) {
        drawRow(context, ["暂无装箱明细", "", "", "", "", ...displaySizes.map(() => ""), "", "", ""], y, 60);
        y += 60;
      }
      for (const row of pageRows) {
        const rowTotal = displaySizes.reduce((sum, size) => sum + (row.sizes.get(size) ?? 0), 0);
        drawRow(context, [row.cartonNo, row.ctns, row.poNumber, row.sku, row.color, ...displaySizes.map((size) => row.sizes.get(size) || ""), rowTotal, rowTotal, row.remark], y, 58);
        y += 58;
      }

      if (pageIndex === pages - 1) {
        drawRow(context, ["合计", orderedCartons.length, "", "", "", ...displaySizes.map(() => ""), "", totals.shipped, ""], y, 65, "#d9eaf7", true);
        y += 110;

        text(context, "合计 / 颜色尺码汇总", margin, y, { bold: true, size: 34 });
        y += 55;
        let x = margin;
        ["COLOUR / 颜色", ...displaySizes, "TOTAL PRS / 总双数"].forEach((header, index) => {
          drawCell(context, header, x, y, summaryWidths[index], 62, { fill: "#d9eaf7", bold: true, size: 27 });
          x += summaryWidths[index];
        });
        y += 62;
        for (const row of Array.from(summaryRows.values()).sort((a, b) => a.color.localeCompare(b.color, "zh-Hans-CN"))) {
          x = margin;
          [row.color, ...displaySizes.map((size) => row.sizes.get(size) || ""), row.total].forEach((cell, index) => {
            drawCell(context, cell, x, y, summaryWidths[index], 58, { size: 27 });
            x += summaryWidths[index];
          });
          y += 58;
        }

        y += 70;
        text(context, `总箱数 ${orderedCartons.length}`, margin, y, { bold: true, size: 30 });
        text(context, `总双数 ${totals.shipped}`, margin + 520, y, { bold: true, size: 30 });
        text(context, "浣滄垚鑰?", margin + 1040, y, { bold: true, size: 30 });
        text(context, "确认者", margin + 1500, y, { bold: true, size: 30 });
      }

      text(context, `${pageIndex + 1} / ${pages}`, pageWidth - margin, pageHeight - 70, { align: "right", size: 26 });
      addCanvasPage(canvas, pageIndex === 0);
    }

    pdf.save(`${currentOrder.po_number || "装箱明细"}.pdf`);
  }

  if (loading) return <div className="panel p-5 text-sm text-slate-500">正在加载装箱数据...</div>;
  if (!order) return <div className="panel p-5 text-sm text-red-600">没有找到这个订单。</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
            <ArrowLeft size={16} />
            返回订单
          </Link>
          <h1 className="truncate text-2xl font-black tracking-normal text-blue-950">一箱装箱</h1>
          <p className="mt-1 text-sm text-blue-700">
            {order.customer_name} / {order.po_number} / {order.sku}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <button type="button" onClick={exportShipmentDetail} className="secondary-btn px-3">
            <Download size={18} />
            Excel
          </button>
          <button type="button" onClick={downloadShipmentPdf} className="primary-btn px-3">
            <Download size={18} />
            PDF
          </button>
        </div>
      </div>

      {message && (
        <p className={`rounded px-3 py-2 text-sm font-bold ${messageType === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message}
        </p>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 md:items-center md:justify-center md:p-6">
          <section className="max-h-[92vh] w-full overflow-hidden rounded-t border border-blue-200 bg-white shadow-2xl md:max-w-2xl md:rounded">
            <div className="flex items-start justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-blue-700">箱号装箱</p>
                <h2 className="truncate text-xl font-black text-blue-950">箱号 {cartonNo || "手动新增"}</h2>
                {selectedUnboxedGroup && (
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    开箱 {selectedUnboxedGroup.quantity} 双 / 已装 {selectedUnboxedGroup.packedQuantity} 双
                    {selectedUnboxedGroup.shortage > 0 ? ` / 少 ${selectedUnboxedGroup.shortage} 双` : ""}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded border border-blue-200 bg-white text-slate-600" aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-150px)] space-y-4 overflow-y-auto px-4 py-4">
              {existingCartonForEditor && (
                <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                  这个箱号已经完成装箱。如需修改，请先在下方箱号明细里删除原装箱记录后重新装箱。
                </p>
              )}
              {selectedUnboxedGroup && selectedUnboxedGroup.quantity < 10 && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">当前箱号开箱数量少于 10 双，完成后会标记为短装。</p>
              )}
              {message && (
                <p className={`rounded px-3 py-2 text-sm font-bold ${messageType === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {message}
                </p>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="label">箱号</span>
                  <input className="field" value={cartonNo} onChange={(event) => setCartonNo(event.target.value)} placeholder="例如 1 / A001" disabled={Boolean(existingCartonForEditor)} />
                </label>
                <label className="space-y-1">
                  <span className="label">备注</span>
                  <input className="field" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="可不填" disabled={Boolean(existingCartonForEditor)} />
                </label>
              </div>

              <div className="space-y-3">
                {rows.map((row) => {
                  const sizeOptions = sizesForColor(row.color);
                  const visibleSizeOptions = Array.from(new Set([row.size, ...sizeOptions].filter(Boolean)));
                  const summary = itemSummary.find((item) => item.color === row.color && item.size === row.size);
                  return (
                    <div key={row.id} className="rounded border border-line bg-blue-50 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="label">颜色</span>
                          <select className="field" value={row.color} onChange={(event) => updateRow(row.id, { color: event.target.value })} disabled={Boolean(existingCartonForEditor)}>
                            {colors.map((color) => (
                              <option key={color} value={color}>
                                {color}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="label">尺码</span>
                          <select className="field" value={row.size} onChange={(event) => updateRow(row.id, { size: event.target.value })} disabled={Boolean(existingCartonForEditor)}>
                            {visibleSizeOptions.length === 0 && <option value="">未填写</option>}
                            {visibleSizeOptions.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <label className="space-y-1">
                          <span className="label">数量</span>
                          <input className="field" type="number" min={1} value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) })} disabled={Boolean(existingCartonForEditor)} />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={Boolean(existingCartonForEditor)}
                          className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded border border-red-200 bg-white text-red-700 disabled:opacity-40"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[10, 5, 15].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setRowQuantity(row.id, preset)}
                            disabled={Boolean(existingCartonForEditor)}
                            className={`rounded border px-3 py-2 text-sm font-black disabled:opacity-40 ${
                              row.quantity === preset ? "border-blue-500 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-800"
                            }`}
                          >
                            {preset} 双
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs font-bold text-blue-700">{selectedUnboxedGroup ? "按开箱记录装箱" : `这个颜色尺码剩余可装：${summary?.remaining ?? 0}`}</p>
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={addRow} disabled={Boolean(existingCartonForEditor)} className="secondary-btn w-full disabled:opacity-40">
                <Plus size={18} />
                加一行
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-blue-100 bg-white px-4 py-3">
              <button type="button" onClick={() => setEditorOpen(false)} className="secondary-btn">
                取消
              </button>
              <button type="button" onClick={() => saveCarton(true)} disabled={saving || Boolean(existingCartonForEditor)} className="primary-btn disabled:opacity-50">
                <Save size={18} />
                {saving ? "保存中" : "完成装箱"}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">已入</p>
          <p className="text-xl font-black text-blue-950">{totals.inbound || totals.planned}</p>
        </div>
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">已装</p>
          <p className="text-xl font-black text-blue-950">{totals.shipped}</p>
        </div>
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">未装</p>
          <p className="text-xl font-black text-blue-950">{totals.remaining}</p>
        </div>
      </div>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-machine" />
            <h2 className="text-lg font-black text-blue-950">开箱箱号对照</h2>
          </div>
          <span className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
            未装 {unboxedStats.pending} / 开箱 {unboxedStats.opened}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-blue-100 bg-blue-50 p-2">
            <p className="text-xs font-bold text-slate-500">已开箱</p>
            <p className="text-lg font-black text-blue-950">{unboxedStats.opened}</p>
          </div>
          <div className="rounded border border-emerald-100 bg-emerald-50 p-2">
            <p className="text-xs font-bold text-slate-500">已装箱</p>
            <p className="text-lg font-black text-emerald-700">{unboxedStats.packed}</p>
          </div>
          <div className="rounded border border-amber-100 bg-amber-50 p-2">
            <p className="text-xs font-bold text-slate-500">未装箱</p>
            <p className="text-lg font-black text-amber-700">{unboxedStats.pending}</p>
          </div>
        </div>

        {unboxedSkuProgress.length > 0 && (
          <div className="mt-3 overflow-hidden rounded border border-blue-100 bg-white">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] bg-blue-50 text-xs font-black text-blue-950">
              <div className="border-r border-blue-100 px-2 py-2 text-left">颜色 / 尺码</div>
              <div className="border-r border-blue-100 px-2 py-2 text-center">已开箱</div>
              <div className="border-r border-blue-100 px-2 py-2 text-center">已装箱</div>
              <div className="px-2 py-2 text-center">未装箱</div>
            </div>
            <div className="divide-y divide-blue-50">
              {unboxedSkuProgress.map((row) => (
                <div key={row.key} className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr] text-sm">
                  <div className="border-r border-blue-50 px-2 py-2">
                    <p className="font-black text-blue-950">{row.color || "-"}</p>
                    <p className="text-xs font-bold text-slate-500">{row.size || "-"}</p>
                  </div>
                  <div className="border-r border-blue-50 px-2 py-2 text-center">
                    <p className="font-black text-blue-950">{row.openedCartons} 箱</p>
                    <p className="text-xs text-slate-500">{row.openedQuantity} 双</p>
                  </div>
                  <div className="border-r border-blue-50 px-2 py-2 text-center">
                    <p className="font-black text-emerald-700">{row.packedCartons} 箱</p>
                    <p className="text-xs text-slate-500">{row.packedQuantity} 双</p>
                  </div>
                  <div className={`px-2 py-2 text-center ${row.pendingCartons > 0 ? "bg-amber-50" : ""}`}>
                    <p className={`font-black ${row.pendingCartons > 0 ? "text-amber-700" : "text-slate-400"}`}>{row.pendingCartons} 箱</p>
                    <p className="text-xs text-slate-500">{row.pendingQuantity} 双</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {unboxedCartonGroups.length === 0 ? (
          <p className="mt-3 rounded border border-dashed border-blue-200 bg-blue-50 px-3 py-3 text-sm font-bold text-blue-700">
            这个订单还没有开箱记录，可以先手动输入箱号。
          </p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {unboxedCartonGroups.map((group) => {
              const shortPacked = isShortPacked(group);
              return (
                <button
                  key={group.cartonNo}
                  ref={(element) => {
                    if (element) {
                      unboxedCartonRefs.current.set(group.cartonNo, element);
                    } else {
                      unboxedCartonRefs.current.delete(group.cartonNo);
                    }
                  }}
                  type="button"
                  onClick={() => applyUnboxedCarton(group.cartonNo)}
                  className={`rounded border p-3 text-left transition ${
                    shortPacked
                      ? "border-red-300 bg-red-50 text-red-900"
                      : group.packed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-blue-200 bg-white text-blue-950 hover:border-blue-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-black">箱号 {group.cartonNo}</span>
                    <span
                      className={`rounded px-2 py-1 text-xs font-black ${
                        shortPacked ? "bg-red-100 text-red-700" : group.packed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {shortPacked ? "短装" : group.packed ? "已装" : "未装"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    开箱 {group.quantity} 双 / 装箱 {group.packedQuantity} 双{group.shortage > 0 ? ` / 少 ${group.shortage} 双` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex items-center gap-2">
          <Package size={18} className="text-machine" />
          <h2 className="text-lg font-black text-blue-950">新增箱号</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="label">箱号</span>
            <input className="field" value={cartonNo} onChange={(event) => setCartonNo(event.target.value)} placeholder="例如 1 / A001" />
          </label>
          <label className="space-y-1">
            <span className="label">备注</span>
            <input className="field" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="可不填" />
          </label>
        </div>

        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const sizeOptions = sizesForColor(row.color);
            const summary = itemSummary.find((item) => item.color === row.color && item.size === row.size);
            return (
              <div key={row.id} className="rounded border border-line bg-blue-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="label">颜色</span>
                    <select className="field" value={row.color} onChange={(event) => updateRow(row.id, { color: event.target.value })}>
                      {colors.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="label">尺码</span>
                    <select className="field" value={row.size} onChange={(event) => updateRow(row.id, { size: event.target.value })}>
                      {sizeOptions.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <label className="space-y-1">
                    <span className="label">数量</span>
                    <input className="field" type="number" min={1} value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) })} />
                  </label>
                  <button type="button" onClick={() => removeRow(row.id)} className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded border border-red-200 bg-white text-red-700">
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[10, 5, 15].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRowQuantity(row.id, preset)}
                      className={`rounded border px-3 py-2 text-sm font-black ${
                        row.quantity === preset ? "border-blue-500 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-800"
                      }`}
                    >
                      {preset} 双
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold text-blue-700">这个颜色尺码剩余可装：{summary?.remaining ?? 0}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={addRow} className="secondary-btn">
            <Plus size={18} />
            加一行
          </button>
          <button type="button" onClick={() => saveCarton()} disabled={saving} className="primary-btn">
            <Save size={18} />
            {saving ? "保存中" : "保存箱号"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-blue-950">箱号明细</h2>
          <button type="button" onClick={finishShipment} disabled={finishing} className="secondary-btn disabled:opacity-50">
            <CheckCircle2 size={18} />
            {finishing ? "完成中" : "完成装箱"}
          </button>
        </div>

        {message && (
          <p className={`rounded px-3 py-2 text-sm font-bold ${messageType === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {message}
          </p>
        )}

        {missingCartonNos.length > 0 && (
          <div className="flex gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>当前订单箱号中间缺少：{missingCartonNos.join("、")}</span>
          </div>
        )}
        {normalizedCartons.length === 0 && <div className="panel p-4 text-sm text-slate-500">还没有装箱箱号。</div>}
        {sortedCartons.map((carton) => {
          const cartonQuantity = carton.items.reduce((sum, item) => sum + item.quantity, 0);
          const sourceGroup = unboxedCartonGroups.find((group) => group.cartonNo === carton.carton_no.trim());
          const shortPacked = sourceGroup ? isShortPacked(sourceGroup) : cartonQuantity < 10;
          return (
          <article key={carton.id} className={`panel p-4 ${shortPacked ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-lg font-black ${shortPacked ? "text-red-900" : "text-emerald-900"}`}>箱号 {carton.carton_no}</h3>
                  <span className={`rounded px-2 py-1 text-xs font-black ${shortPacked ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {shortPacked ? "短装" : "已装"}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {cartonQuantity} 双{carton.remark ? `/ ${carton.remark}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => restoreCartonToPacking(carton)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded border border-blue-200 bg-white text-blue-700"
                  aria-label="恢复到装箱"
                >
                  <RotateCcw size={18} />
                </button>
                <button type="button" onClick={() => deleteCarton(carton.id)} className="inline-flex h-10 w-10 items-center justify-center rounded border border-red-200 bg-white text-red-700">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {carton.items.map((item) => (
                <div key={item.id} className="rounded border border-line bg-blue-50 p-2">
                  <p className="font-black text-blue-950">{item.color}</p>
                  <p className="text-sm text-slate-600">
                    {item.size} / {item.quantity} 双
                  </p>
                </div>
              ))}
            </div>
          </article>
          );
        })}
      </section>
    </div>
  );
}

