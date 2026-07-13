"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import { findMissingCartonNos, sortByCartonNo } from "@/lib/cartonNumbers";
import { shortDate } from "@/lib/format";
import { getActiveOrders, getOrderItems } from "@/src/api/ordersApi";
import { getRecentUnboxingRecords, getUnboxingPhotoPublicUrl, insertUnboxingRecord, uploadUnboxingPhoto } from "@/src/api/shipmentApi";
import { compressImageFile, createSafeId, formatMb } from "@/src/utils";
import type { Order, OrderItem, UnboxingRecord } from "@/lib/types";
import { AlertTriangle, Camera, PackageOpen, Save } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

export default function UnboxPage() {
  const user = useCurrentUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [records, setRecords] = useState<UnboxingRecord[]>([]);
  const [orderId, setOrderId] = useState("");
  const [cartonNo, setCartonNo] = useState("");
  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [shortageQuantity, setShortageQuantity] = useState(0);
  const [remark, setRemark] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
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
      const { data } = await getOrderItems(orderId);
      const rows = (data ?? []) as OrderItem[];
      setItems(rows);
      setSku(rows[0]?.sku || "");
      setColor(rows[0]?.color || "");
      setSize(rows[0]?.size || "");
      setQuantity(Number(rows[0]?.quantity_per_carton || 10));
    }

    loadItems();
  }, [orderId]);

  const selectedOrder = orders.find((order) => order.id === orderId) ?? null;
  const selectedItem = useMemo(() => items.find((item) => item.sku === sku && item.color === color && item.size === size) ?? null, [items, sku, color, size]);
  const selectedOrderRecords = useMemo(() => records.filter((record) => record.order_id === orderId), [records, orderId]);
  const sortedRecords = useMemo(() => sortByCartonNo(selectedOrderRecords), [selectedOrderRecords]);
  const missingCartonNos = useMemo(() => findMissingCartonNos(selectedOrderRecords.map((record) => record.carton_no)), [selectedOrderRecords]);
  const skus = useMemo(() => Array.from(new Set(items.map((item) => item.sku).filter(Boolean))), [items]);
  const colors = useMemo(() => {
    const source = sku ? items.filter((item) => item.sku === sku) : items;
    return Array.from(new Set(source.map((item) => item.color).filter(Boolean)));
  }, [items, sku]);
  const sizes = useMemo(() => {
    const source = items.filter((item) => (!sku || item.sku === sku) && (!color || item.color === color));
    return Array.from(new Set(source.map((item) => item.size).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
  }, [items, sku, color]);

  function changeSku(nextSku: string) {
    const nextItem = items.find((item) => item.sku === nextSku) ?? null;
    setSku(nextSku);
    setColor(nextItem?.color ?? "");
    setSize(nextItem?.size ?? "");
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
  }

  function changeColor(nextColor: string) {
    const nextItem = items.find((item) => item.sku === sku && item.color === nextColor) ?? null;
    setColor(nextColor);
    setSize(nextItem?.size ?? "");
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
  }

  function changeSize(nextSize: string) {
    const nextItem = items.find((item) => item.sku === sku && item.color === color && item.size === nextSize) ?? null;
    setSize(nextSize);
    setQuantity(Number(nextItem?.quantity_per_carton || 10));
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
    if (!sku || !color || !size) {
      setMessage("请选择货号、颜色和尺码。");
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

      const { data, error } = await insertUnboxingRecord({
        order_id: selectedOrder.id,
        user_id: user.id,
        carton_no: cartonNo.trim(),
        po_number: selectedOrder.po_number,
        sku,
        color,
        size,
        quantity: Number(quantity || 0),
        shortage_quantity: Number(shortageQuantity || 0),
        remark: remark || null,
        photo_url: photoUrl,
        photo_path: photoPath
      });

      if (error) throw error;

      setRecords((current) => [data as UnboxingRecord, ...current]);
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

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="label">箱号</span>
            <input className="field" value={cartonNo} onChange={(event) => setCartonNo(event.target.value)} placeholder="例如 A001 / 1" required />
          </label>
          <label className="space-y-1">
            <span className="label">订单号</span>
            <input className="field bg-slate-50" value={selectedOrder?.po_number ?? ""} readOnly />
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
