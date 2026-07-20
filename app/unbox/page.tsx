"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import { findMissingCartonNos, sortByCartonNo } from "@/lib/cartonNumbers";
import { shortDate } from "@/lib/format";
import { getActiveOrders, getOrderItems } from "@/src/api/ordersApi";
import { getRecentUnboxingRecords, getReservationCartonPlan, getUnboxingPhotoPublicUrl, getUnboxingRecords, insertUnboxingRecord, insertUnboxingRecords, uploadUnboxingPhoto } from "@/src/api/shipmentApi";
import { compressImageFile, createSafeId, formatMb } from "@/src/utils";
import type { Order, OrderItem, ReservationCarton, ReservationCartonItem, UnboxingRecord } from "@/lib/types";
import { AlertTriangle, Camera, CheckSquare, PackageOpen, Save } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

export default function UnboxPage() {
  const user = useCurrentUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [plannedCartons, setPlannedCartons] = useState<ReservationCarton[]>([]);
  const [plannedCartonItems, setPlannedCartonItems] = useState<ReservationCartonItem[]>([]);
  const [records, setRecords] = useState<UnboxingRecord[]>([]);
  const [orderId, setOrderId] = useState("");
  const [cartonNo, setCartonNo] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [shortageQuantity, setShortageQuantity] = useState(0);
  const [remark, setRemark] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: orderRows }, { data: recordRows }] = await Promise.all([getActiveOrders(), getRecentUnboxingRecords(30)]);
      const rows = (orderRows ?? []) as Order[];
      setOrders(rows);
      setOrderId((current) => current || rows[0]?.id || "");
      setRecords((recordRows ?? []) as UnboxingRecord[]);
    }

    load();
  }, []);

  useEffect(() => {
    async function loadItems() {
      if (!orderId) {
        setItems([]);
        return;
      }
      const [{ data }, { data: planData }, { data: orderRecordRows }] = await Promise.all([getOrderItems(orderId), getReservationCartonPlan(orderId), getUnboxingRecords(orderId)]);
      const rows = (data ?? []) as OrderItem[];
      setItems(rows);
      setPlannedCartons(planData?.cartons ?? []);
      setPlannedCartonItems(planData?.items ?? []);
      setRecords((current) => [...((orderRecordRows ?? []) as UnboxingRecord[]), ...current.filter((record) => record.order_id !== orderId)]);
      setCartonNo("");
      setPoNumber(rows[0]?.po_number || "");
      setSku(rows[0]?.sku || "");
      setColor(rows[0]?.color || "");
      setSize(rows[0]?.size || "");
      setQuantity(Number(rows[0]?.quantity_per_carton || 10));
    }

    loadItems();
  }, [orderId]);

  const selectedOrder = orders.find((order) => order.id === orderId) ?? null;
  const selectedItem = useMemo(
    () => items.find((item) => item.po_number === poNumber && item.sku === sku && item.color === color && item.size === size) ?? null,
    [items, poNumber, sku, color, size]
  );
  const selectedOrderRecords = useMemo(() => records.filter((record) => record.order_id === orderId), [records, orderId]);
  const sortedRecords = useMemo(() => sortByCartonNo(selectedOrderRecords), [selectedOrderRecords]);
  const missingCartonNos = useMemo(() => findMissingCartonNos(selectedOrderRecords.map((record) => record.carton_no)), [selectedOrderRecords]);
  const selectedPlannedCarton = useMemo(() => plannedCartons.find((carton) => carton.carton_no === cartonNo.trim()) ?? null, [plannedCartons, cartonNo]);
  const selectedPlannedItems = useMemo(
    () => (selectedPlannedCarton ? plannedCartonItems.filter((item) => item.reservation_carton_id === selectedPlannedCarton.id) : []),
    [plannedCartonItems, selectedPlannedCarton]
  );
  const unopenedPlannedCartons = useMemo(
    () => sortByCartonNo(plannedCartons).filter((carton) => !selectedOrderRecords.some((record) => record.carton_no === carton.carton_no)),
    [plannedCartons, selectedOrderRecords]
  );
  const unopenedPlannedItemCount = useMemo(
    () => unopenedPlannedCartons.reduce((sum, carton) => sum + plannedCartonItems.filter((item) => item.reservation_carton_id === carton.id).length, 0),
    [plannedCartonItems, unopenedPlannedCartons]
  );
  const poNumbers = useMemo(() => Array.from(new Set(items.map((item) => item.po_number).filter(Boolean))), [items]);
  const skus = useMemo(() => {
    const source = poNumber ? items.filter((item) => item.po_number === poNumber) : items;
    return Array.from(new Set(source.map((item) => item.sku).filter(Boolean)));
  }, [items, poNumber]);
  const colors = useMemo(() => {
    const source = items.filter((item) => (!poNumber || item.po_number === poNumber) && (!sku || item.sku === sku));
    return Array.from(new Set(source.map((item) => item.color).filter(Boolean)));
  }, [items, poNumber, sku]);
  const sizes = useMemo(() => {
    const source = items.filter((item) => (!poNumber || item.po_number === poNumber) && (!sku || item.sku === sku) && (!color || item.color === color));
    return Array.from(new Set(source.map((item) => item.size).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
  }, [items, poNumber, sku, color]);

  useEffect(() => {
    if (plannedCartons.length === 0 || plannedCartonItems.length === 0) return;
    if (cartonNo && plannedCartons.some((carton) => carton.carton_no === cartonNo.trim())) return;

    const sortedCartons = sortByCartonNo(plannedCartons);
    const nextCarton = sortedCartons.find((carton) => !selectedOrderRecords.some((record) => record.carton_no === carton.carton_no)) ?? sortedCartons[0] ?? null;
    if (!nextCarton) return;

    const firstItem = plannedCartonItems.find((item) => item.reservation_carton_id === nextCarton.id) ?? null;
    setCartonNo(nextCarton.carton_no);
    if (firstItem) {
      setPoNumber(firstItem.po_number);
      setSku(firstItem.sku);
      setColor(firstItem.color);
      setSize(firstItem.size);
      setQuantity(Number(firstItem.quantity || 0));
    }
  }, [cartonNo, plannedCartons, plannedCartonItems, selectedOrderRecords]);

  function changePoNumber(nextPoNumber: string) {
    const nextItem = items.find((item) => item.po_number === nextPoNumber) ?? null;
    setPoNumber(nextPoNumber);
    setSku(nextItem?.sku ?? "");
    setColor(nextItem?.color ?? "");
    setSize(nextItem?.size ?? "");
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
  }

  function changeSku(nextSku: string) {
    const nextItem = items.find((item) => (!poNumber || item.po_number === poNumber) && item.sku === nextSku) ?? null;
    setSku(nextSku);
    setColor(nextItem?.color ?? "");
    setSize(nextItem?.size ?? "");
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
  }

  function changeColor(nextColor: string) {
    const nextItem = items.find((item) => item.po_number === poNumber && item.sku === sku && item.color === nextColor) ?? null;
    setColor(nextColor);
    setSize(nextItem?.size ?? "");
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
  }

  function changeSize(nextSize: string) {
    const nextItem = items.find((item) => item.po_number === poNumber && item.sku === sku && item.color === color && item.size === nextSize) ?? null;
    setSize(nextSize);
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
  }

  function choosePlannedCarton(carton: ReservationCarton) {
    const planItems = plannedCartonItems.filter((item) => item.reservation_carton_id === carton.id);
    const firstItem = planItems[0] ?? null;
    setCartonNo(carton.carton_no);
    if (firstItem) {
      setPoNumber(firstItem.po_number);
      setSku(firstItem.sku);
      setColor(firstItem.color);
      setSize(firstItem.size);
      setQuantity(Number(firstItem.quantity || 0));
    }
    setShortageQuantity(0);
    setRemark("");
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (preview) URL.revokeObjectURL(preview);
    setPreview("");
    setPhoto(null);
    if (!file) return;
    const compressed = await compressImageFile(file, { fileName: "unboxing-shortage.jpg" });
    setPhoto(compressed);
    setPreview(URL.createObjectURL(compressed));
    setMessage(`照片已压缩：${formatMb(file.size)} -> ${formatMb(compressed.size)}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedOrder) return;
    setMessage("");

    if (!cartonNo.trim()) {
      setMessage("请填写箱号。");
      return;
    }
    if (!poNumber || !sku || !color || !size) {
      setMessage("请选择订单号、货号、颜色和尺码。");
      return;
    }
    if (shortageQuantity > 0 && !photo) {
      setMessage("有少鞋数量时，需要上传照片。");
      return;
    }

    const nextMissingCartonNos = findMissingCartonNos([...selectedOrderRecords.map((record) => record.carton_no), cartonNo.trim()]);
    if (nextMissingCartonNos.length > 0) {
      const ok = window.confirm(`当前箱号中间缺少：${nextMissingCartonNos.join("、")}。确认继续保存吗？`);
      if (!ok) return;
    }

    setSaving(true);
    let photoUrl: string | null = null;
    let photoPath: string | null = null;

    try {
      if (photo) {
        photoPath = `${user.id}/${selectedOrder.id}/unbox-${createSafeId()}.jpg`;
        const { error: uploadError } = await uploadUnboxingPhoto(photoPath, photo);
        if (uploadError) throw uploadError;
        photoUrl = getUnboxingPhotoPublicUrl(photoPath);
      }

      const recordsToInsert =
        selectedPlannedItems.length > 1 && Number(shortageQuantity || 0) === 0
          ? selectedPlannedItems.map((item) => ({
              order_id: selectedOrder.id,
              user_id: user.id,
              carton_no: cartonNo.trim(),
              po_number: item.po_number,
              sku: item.sku,
              color: item.color,
              size: item.size,
              quantity: Number(item.quantity || 0),
              shortage_quantity: 0,
              remark: remark || null,
              photo_url: photoUrl,
              photo_path: photoPath
            }))
          : [
              {
                order_id: selectedOrder.id,
                user_id: user.id,
                carton_no: cartonNo.trim(),
                po_number: poNumber,
                sku,
                color,
                size,
                quantity: Number(quantity || 0),
                shortage_quantity: Number(shortageQuantity || 0),
                remark: remark || null,
                photo_url: photoUrl,
                photo_path: photoPath
              }
            ];

      const insertedRecords: UnboxingRecord[] = [];
      for (const record of recordsToInsert) {
        const { data, error } = await insertUnboxingRecord(record);
        if (error) throw error;
        insertedRecords.push(data as UnboxingRecord);
      }

      setRecords((current) => [...insertedRecords, ...current]);
      setCartonNo("");
      setQuantity(10);
      setShortageQuantity(0);
      setRemark("");
      setPhoto(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      setMessage("开箱记录已保存。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`${detail}。请确认 Supabase 已执行最新 schema.sql。`);
    } finally {
      setSaving(false);
    }
  }

  async function openAllPlannedCartons() {
    if (!user || !selectedOrder || unopenedPlannedCartons.length === 0 || bulkSaving) return;

    const ok = window.confirm(`确认将剩余 ${unopenedPlannedCartons.length} 箱全部登记为已开箱吗？如果有少鞋，请不要使用一键全部开箱。`);
    if (!ok) return;

    const rows = unopenedPlannedCartons.flatMap((carton) =>
      plannedCartonItems
        .filter((item) => item.reservation_carton_id === carton.id)
        .map((item) => ({
          order_id: selectedOrder.id,
          user_id: user.id,
          carton_no: carton.carton_no,
          po_number: item.po_number,
          sku: item.sku,
          color: item.color,
          size: item.size,
          quantity: Number(item.quantity || 0),
          shortage_quantity: 0,
          remark: "一键全部开箱",
          photo_url: null,
          photo_path: null
        }))
    );

    if (rows.length === 0) {
      setMessage("这个订单没有可自动开箱的预约箱内明细。");
      return;
    }

    setBulkSaving(true);
    setMessage(`正在一键开箱：${unopenedPlannedCartons.length} 箱 / ${rows.length} 条明细...`);

    try {
      const { data, error } = await insertUnboxingRecords(rows);
      if (error) throw error;
      const inserted = (data ?? []) as UnboxingRecord[];
      setRecords((current) => [...inserted, ...current]);
      setCartonNo("");
      setShortageQuantity(0);
      setRemark("");
      setMessage(`已完成一键开箱：${unopenedPlannedCartons.length} 箱。`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`${detail}。请确认 Supabase 已执行最新 staff_shared_access.sql 和 schema.sql。`);
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <PackageOpen size={14} />
          开箱
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">流水线开箱记录</h1>
        <p className="mt-1 text-sm text-blue-700">记录箱号、订单号、番号、颜色、尺码、数量；少鞋时上传照片留证。</p>
      </div>

      <form onSubmit={submit} className="panel space-y-4 p-4">
        <label className="space-y-1">
          <span className="label">订单</span>
          <select className="field" value={orderId} onChange={(event) => setOrderId(event.target.value)} required>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.customer_name} / {order.po_number} / {order.sku} / 出货 {order.shipping_date ?? "-"}
              </option>
            ))}
          </select>
        </label>

        {plannedCartons.length > 0 && (
          <section className="rounded border border-blue-200 bg-blue-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-blue-950">预约箱号</p>
                <p className="text-xs font-bold text-blue-700">点击箱号后自动带出箱内货号、颜色、尺码和数量。</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-white px-2 py-1 text-xs font-black text-blue-700">
                  待开 {unopenedPlannedCartons.length} / {plannedCartons.length} 箱
                </span>
                <button
                  type="button"
                  onClick={openAllPlannedCartons}
                  disabled={bulkSaving || saving || unopenedPlannedCartons.length === 0 || unopenedPlannedItemCount === 0}
                  className="inline-flex min-h-9 items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-black text-blue-800 disabled:opacity-50"
                >
                  <CheckSquare size={14} />
                  {bulkSaving ? "开箱中" : "全部开箱"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
              {sortByCartonNo(plannedCartons).map((carton) => {
                const confirmed = selectedOrderRecords.some((record) => record.carton_no === carton.carton_no);
                return (
                  <button
                    key={carton.id}
                    type="button"
                    onClick={() => choosePlannedCarton(carton)}
                    className={`min-h-10 rounded border px-2 text-xs font-black ${
                      cartonNo.trim() === carton.carton_no
                        ? "border-blue-600 bg-blue-600 text-white"
                        : confirmed
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-blue-200 bg-white text-blue-900"
                    }`}
                  >
                    {carton.carton_no}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {selectedPlannedItems.length > 0 && (
          <section className="rounded border border-blue-200 bg-white p-3">
            <p className="text-sm font-black text-blue-950">箱内预约内容</p>
            <div className="mt-2 space-y-2">
              {selectedPlannedItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 rounded bg-blue-50 px-3 py-2 text-sm">
                  <span className="font-bold text-slate-700">
                    {item.po_number} / {item.sku} / {item.color} / {item.size}
                  </span>
                  <span className="font-black text-blue-700">{item.quantity} 双</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="label">箱号</span>
            <input className="field" value={cartonNo} onChange={(event) => setCartonNo(event.target.value)} placeholder="例如 A001 / 1" required />
          </label>
          <label className="space-y-1">
            <span className="label">订单号</span>
            <select className="field" value={poNumber} onChange={(event) => changePoNumber(event.target.value)} required>
              {poNumbers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="label">番号</span>
            <select className="field" value={sku} onChange={(event) => changeSku(event.target.value)} required>
              {skus.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="label">颜色</span>
            <select className="field" value={color} onChange={(event) => changeColor(event.target.value)}>
              {colors.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="label">尺码</span>
            <select className="field" value={size} onChange={(event) => changeSize(event.target.value)}>
              {sizes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="label">实际数量</span>
            <input className="field" type="number" inputMode="numeric" min={0} value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 0))} />
            {selectedItem && (
              <p className="text-xs font-bold text-blue-700">
                预约 {selectedItem.carton_count || 0} 箱 / 入数 {selectedItem.quantity_per_carton || 10} / 总数 {selectedItem.quantity}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[10, 5, 15].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuantity(preset)}
                  className={`rounded border px-3 py-2 text-sm font-black ${
                    quantity === preset ? "border-blue-500 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-800"
                  }`}
                >
                  {preset} 双
                </button>
              ))}
            </div>
          </label>
          <label className="space-y-1">
            <span className="label">少鞋数量</span>
            <input className="field" type="number" inputMode="numeric" min={0} value={shortageQuantity} onChange={(event) => setShortageQuantity(Number(event.target.value || 0))} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="label">备注</span>
          <textarea className="field min-h-20 resize-none" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="少鞋原因、箱况、处理意见" />
        </label>

        <div>
          <p className="label">少鞋照片</p>
          <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-line bg-blue-50 p-3 text-center">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="少鞋照片" className="max-h-56 rounded object-contain" />
            ) : (
              <>
                <Camera size={28} className="text-blue-500" />
                <span className="mt-2 text-sm font-bold text-slate-600">少鞋时拍照上传</span>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} />
          </label>
        </div>

        {message && <p className="rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}

        <button type="submit" disabled={saving || !selectedOrder} className="primary-btn w-full">
          <Save size={18} />
          {saving ? "保存中" : "保存开箱记录"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-blue-950">最近开箱记录</h2>
        {missingCartonNos.length > 0 && (
          <div className="flex gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>当前订单箱号中间缺少：{missingCartonNos.join("、")}</span>
          </div>
        )}
        {sortedRecords.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无开箱记录。</div>}
        {sortedRecords.map((record) => (
          <article key={record.id} className="panel flex gap-3 p-3">
            {record.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.photo_url} alt={record.carton_no} className="h-20 w-20 shrink-0 rounded object-cover" />
            ) : (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded bg-blue-50 text-blue-400">
                <PackageOpen size={22} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black">箱号 {record.carton_no}</p>
                {record.shortage_quantity > 0 && <p className="font-black text-red-600">少 {record.shortage_quantity}</p>}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {record.po_number} / {record.sku} / {record.color} / {record.size} / {record.quantity}
              </p>
              <p className="mt-1 text-xs text-slate-500">{shortDate(record.created_at)}</p>
              {record.remark && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{record.remark}</p>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
