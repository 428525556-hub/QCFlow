"use client";

import { uploadCompressedImage } from "@/lib/imageUpload";
import { getDispatchOrderData, insertDispatchRecord } from "@/src/api/dispatchApi";
import { getCurrentUser } from "@/src/api/userApi";
import { buildDispatchDiffRows, buildDispatchTotals, type DispatchDiffRow } from "@/src/services/shipmentService";
import type { DispatchRecord, Order, OrderItem, ShipmentCarton, ShipmentItem } from "@/lib/types";
import { ArrowLeft, Camera, CheckCircle2, PackageCheck, Save, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type PhotoKey = "vehicle" | "carton" | "container";
type PhotoState = {
  url: string;
  path: string;
  uploading: boolean;
};

function photoLabel(key: PhotoKey) {
  if (key === "vehicle") return "车辆信息/车牌照片";
  if (key === "carton") return "箱子外观照片";
  return "集装箱内部照片";
}

export default function DispatchOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [cartons, setCartons] = useState<ShipmentCarton[]>([]);
  const [shipmentItems, setShipmentItems] = useState<ShipmentItem[]>([]);
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [remark, setRemark] = useState("");
  const [shortageDetail, setShortageDetail] = useState("");
  const [photos, setPhotos] = useState<Record<PhotoKey, PhotoState>>({
    vehicle: { url: "", path: "", uploading: false },
    carton: { url: "", path: "", uploading: false },
    container: { url: "", path: "", uploading: false }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getDispatchOrderData(orderId);

    if (error) {
      setMessage(`${error.message}。请确认已执行出货 SQL。`);
    }

    setOrder((data.order ?? null) as Order | null);
    setItems((data.items ?? []) as OrderItem[]);
    setCartons((data.cartons ?? []) as ShipmentCarton[]);
    setShipmentItems((data.shipmentItems ?? []) as ShipmentItem[]);
    setRecords((data.records ?? []) as DispatchRecord[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => buildDispatchTotals(items, shipmentItems, cartons), [items, shipmentItems, cartons]);
  const diffRows = useMemo<DispatchDiffRow[]>(() => buildDispatchDiffRows(items, shipmentItems), [items, shipmentItems]);

  useEffect(() => {
    if (diffRows.length === 0) {
      setShortageDetail("");
      return;
    }

    setShortageDetail(
      diffRows
        .map((row) => `${row.po_number || "-"} / ${row.sku || "-"} / ${row.color} / ${row.size} 少 ${row.shortage} 双（应出 ${row.expected}，已装 ${row.packed}）`)
        .join("\n")
    );
  }, [diffRows]);

  function fullDispatch() {
    setShortageDetail("");
    setRemark("满单出货：装箱数量与订单应出数量一致。");
  }

  async function uploadPhoto(key: PhotoKey, file?: File) {
    if (!file) return;
    setMessage("");
    setPhotos((current) => ({ ...current, [key]: { ...current[key], uploading: true } }));
    try {
      const result = await uploadCompressedImage(file, `dispatch/${orderId}/${key}`);
      setPhotos((current) => ({ ...current, [key]: { url: result.url, path: result.path, uploading: false } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "照片上传失败。");
      setPhotos((current) => ({ ...current, [key]: { ...current[key], uploading: false } }));
    }
  }

  async function saveDispatch() {
    if (!order) return;
    setMessage("");
    setSaving(true);

    const { data: session } = await getCurrentUser();
    const userId = session.user?.id;
    if (!userId) {
      setMessage("登录已失效，请重新登录。");
      setSaving(false);
      return;
    }

    const { error } = await insertDispatchRecord({
      order_id: order.id,
      user_id: userId,
      total_cartons: totals.cartons,
      total_quantity: totals.packed,
      expected_quantity: totals.expected,
      is_full_dispatch: totals.matched && !shortageDetail.trim(),
      shortage_detail: shortageDetail.trim() || null,
      vehicle_plate: vehiclePlate.trim() || null,
      remark: remark.trim() || null,
      vehicle_photo_url: photos.vehicle.url || null,
      vehicle_photo_path: photos.vehicle.path || null,
      carton_photo_url: photos.carton.url || null,
      carton_photo_path: photos.carton.path || null,
      container_photo_url: photos.container.url || null,
      container_photo_path: photos.container.path || null
    });

    if (error) {
      setMessage(`${error.message}。请确认已执行出货 SQL。`);
      setSaving(false);
      return;
    }

    setMessage("出货记录已提交。");
    setSaving(false);
    await load();
  }

  if (loading) return <div className="panel p-5 text-sm text-slate-500">正在加载出货数据...</div>;
  if (!order) return <div className="panel p-5 text-sm text-red-600">没有找到这个订单。</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dispatch" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
            <ArrowLeft size={16} />
            返回出货
          </Link>
          <h1 className="truncate text-2xl font-black tracking-normal text-blue-950">出货确认</h1>
          <p className="mt-1 text-sm text-blue-700">
            {order.customer_name} / {order.po_number} / {order.sku}
          </p>
        </div>
        <Truck className="shrink-0 text-machine" size={28} />
      </div>

      {message && <p className={`rounded px-3 py-2 text-sm font-bold ${message.includes("已提交") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">总箱数</p>
          <p className="text-xl font-black text-blue-950">{totals.cartons}</p>
        </div>
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">应出</p>
          <p className="text-xl font-black text-blue-950">{totals.expected}</p>
        </div>
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">装箱</p>
          <p className="text-xl font-black text-blue-950">{totals.packed}</p>
        </div>
        <div className="rounded border border-blue-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-500">差异</p>
          <p className={`text-xl font-black ${totals.shortage === 0 ? "text-emerald-700" : "text-red-600"}`}>{totals.shortage}</p>
        </div>
      </div>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-blue-950">一致性确认</h2>
            <p className="text-sm text-slate-500">装箱数据来自前面的“装箱”环节。</p>
          </div>
          <button type="button" onClick={fullDispatch} disabled={!totals.matched} className="primary-btn shrink-0 px-3 disabled:bg-slate-300">
            <CheckCircle2 size={18} />
            满单出货
          </button>
        </div>

        {diffRows.length === 0 ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">总数量一致，可以满单出货。</div>
        ) : (
          <div className="space-y-2">
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">当前不一致，下面是少装明细。</div>
            {diffRows.map((row) => (
              <div key={`${row.color}-${row.size}-${row.po_number}`} className="rounded border border-line bg-blue-50 p-3 text-sm">
                <p className="font-black text-blue-950">
                  {row.color} / {row.size} 少 {row.shortage} 双
                </p>
                <p className="mt-1 text-slate-500">
                  订单号 {row.po_number || "-"} / 番号 {row.sku || "-"} / 应出 {row.expected} / 已装 {row.packed}
                </p>
              </div>
            ))}
          </div>
        )}

        <label className="mt-4 block space-y-1">
          <span className="label">差异说明</span>
          <textarea className="field min-h-28 resize-none" value={shortageDetail} onChange={(event) => setShortageDetail(event.target.value)} placeholder="不一致时自动生成，也可以手动补充" />
        </label>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-black text-blue-950">车辆与现场照片</h2>
        <label className="mb-3 block space-y-1">
          <span className="label">车牌号</span>
          <input className="field" value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} placeholder="例如 沪A12345" />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          {(["vehicle", "carton", "container"] as PhotoKey[]).map((key) => (
            <label key={key} className="rounded border border-line bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2 font-black text-blue-950">
                <Camera size={17} />
                {photoLabel(key)}
              </div>
              <input type="file" accept="image/*" capture="environment" className="field bg-white text-sm" onChange={(event) => uploadPhoto(key, event.target.files?.[0])} />
              {photos[key].uploading && <p className="mt-2 text-xs font-bold text-blue-700">正在压缩并上传...</p>}
              {photos[key].url && (
                <span className="relative mt-2 block h-28 w-full overflow-hidden rounded border border-line">
                  <Image src={photos[key].url} alt={photoLabel(key)} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                </span>
              )}
            </label>
          ))}
        </div>

        <label className="mt-3 block space-y-1">
          <span className="label">备注</span>
          <textarea className="field min-h-24 resize-none" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="车辆、集装箱情况、现场交接说明" />
        </label>

        <button type="button" onClick={saveDispatch} disabled={saving || Object.values(photos).some((photo) => photo.uploading)} className="primary-btn mt-4 w-full">
          <Save size={18} />
          {saving ? "提交中..." : "提交出货记录"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-blue-950">历史出货记录</h2>
        {records.length === 0 && <div className="panel p-4 text-sm text-slate-500">还没有提交过出货记录。</div>}
        {records.map((record) => (
          <article key={record.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-blue-950">{record.is_full_dispatch ? "满单出货" : "差异出货"}</p>
                <p className="mt-1 text-sm text-slate-500">
                  箱数 {record.total_cartons} / 出货 {record.total_quantity} / 应出 {record.expected_quantity}
                </p>
              </div>
              <PackageCheck className={record.is_full_dispatch ? "text-emerald-700" : "text-red-600"} size={22} />
            </div>
            {record.vehicle_plate && <p className="mt-2 text-sm font-bold text-blue-700">车牌号：{record.vehicle_plate}</p>}
            {record.shortage_detail && <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-2 text-xs font-bold text-red-700">{record.shortage_detail}</pre>}
            {record.remark && <p className="mt-2 text-sm text-slate-600">{record.remark}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
