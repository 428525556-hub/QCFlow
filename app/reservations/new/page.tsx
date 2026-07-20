"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import type { InspectionPlan } from "@/lib/types";
import { insertOrderAttachments, uploadOrderAttachmentFile } from "@/src/api/orderAttachmentsApi";
import { createOrder, insertOrderItems } from "@/src/api/ordersApi";
import { insertReservationCartonPlan } from "@/src/api/shipmentApi";
import { FileSpreadsheet, Layers3, PackageSearch, Plus, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type SizeForm = {
  id: string;
  size: string;
  carton_count: string;
  quantity_per_carton: string;
  quantity: string;
};

type ColorForm = {
  id: string;
  color: string;
  sizes: SizeForm[];
};

type StyleForm = {
  id: string;
  sku: string;
  colors: ColorForm[];
};

type PurchaseOrderForm = {
  id: string;
  po_number: string;
  styles: StyleForm[];
};

type ReservationMode = "quantity" | "carton";

type CartonPlanItemForm = {
  id: string;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  quantity: string;
};

type CartonPlanGroupForm = {
  id: string;
  carton_start: string;
  carton_end: string;
  items: CartonPlanItemForm[];
};

type ReservationForm = {
  customer_name: string;
  factory_name: string;
  inbound_date: string;
  shipping_date: string;
  inspection_plan: InspectionPlan;
  reservation_remark: string;
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSize(): SizeForm {
  return { id: createId(), size: "", carton_count: "", quantity_per_carton: "10", quantity: "" };
}

function createColor(): ColorForm {
  return { id: createId(), color: "", sizes: [createSize()] };
}

function createStyle(): StyleForm {
  return { id: createId(), sku: "", colors: [createColor()] };
}

function createPurchaseOrder(): PurchaseOrderForm {
  return { id: createId(), po_number: "", styles: [createStyle()] };
}

function createCartonPlanItem(): CartonPlanItemForm {
  return { id: createId(), po_number: "", sku: "", color: "", size: "", quantity: "10" };
}

function createCartonPlanGroup(): CartonPlanGroupForm {
  return { id: createId(), carton_start: "", carton_end: "", items: [createCartonPlanItem()] };
}

function safeFileName(name: string) {
  const dotIndex = name.lastIndexOf(".");
  const rawBase = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const rawExt = dotIndex > 0 ? name.slice(dotIndex + 1) : "";
  const base = rawBase.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "file";
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  return ext ? `${base.slice(0, 80)}.${ext}` : base.slice(0, 80);
}

function toNumber(value: string | number | null | undefined) {
  return Number(value || 0);
}

function sizeTotal(sizes: SizeForm[]) {
  return sizes.reduce((sum, size) => sum + toNumber(size.quantity), 0);
}

function colorTotal(color: ColorForm) {
  return sizeTotal(color.sizes);
}

function styleTotal(style: StyleForm) {
  return style.colors.reduce((sum, color) => sum + colorTotal(color), 0);
}

function orderTotal(order: PurchaseOrderForm) {
  return order.styles.reduce((sum, style) => sum + styleTotal(style), 0);
}

function expandCartonRange(start: string, end: string) {
  const first = start.trim();
  const last = end.trim() || first;
  if (!first) return [];
  if (first === last) return [first];

  const firstMatch = first.match(/^(.*?)(\d+)$/);
  const lastMatch = last.match(/^(.*?)(\d+)$/);
  if (!firstMatch || !lastMatch || firstMatch[1] !== lastMatch[1]) return [first, last];

  const prefix = firstMatch[1];
  const from = Number(firstMatch[2]);
  const to = Number(lastMatch[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 1000) return [first, last];

  const width = Math.max(firstMatch[2].length, lastMatch[2].length);
  return Array.from({ length: to - from + 1 }, (_, index) => `${prefix}${String(from + index).padStart(width, "0")}`);
}

function cartonGroupNos(group: CartonPlanGroupForm) {
  return expandCartonRange(group.carton_start, group.carton_end);
}

function cartonGroupTotal(group: CartonPlanGroupForm) {
  const oneCartonQuantity = group.items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  return oneCartonQuantity * cartonGroupNos(group).length;
}

function summarizeCartonItems(groups: CartonPlanGroupForm[]) {
  const summary = new Map<string, { po_number: string; sku: string; color: string; size: string; carton_count: number; quantity_per_carton: number; quantity: number }>();

  for (const group of groups) {
    const cartonCount = cartonGroupNos(group).length;
    if (cartonCount === 0) continue;
    for (const item of group.items) {
      const row = {
        po_number: item.po_number.trim(),
        sku: item.sku.trim(),
        color: item.color.trim() || "未定",
        size: item.size.trim() || "未定",
        quantity_per_carton: Number(item.quantity || 0),
        quantity: Number(item.quantity || 0) * cartonCount
      };
      const key = [row.po_number, row.sku, row.color, row.size].join("||");
      const current = summary.get(key);
      if (current) {
        current.carton_count += cartonCount;
        current.quantity += row.quantity;
      } else {
        summary.set(key, { ...row, carton_count: cartonCount });
      }
    }
  }

  return Array.from(summary.values());
}

export default function NewReservationPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [form, setForm] = useState<ReservationForm>({
    customer_name: "",
    factory_name: "",
    inbound_date: "",
    shipping_date: "",
    inspection_plan: "both",
    reservation_remark: ""
  });
  const [reservationMode, setReservationMode] = useState<ReservationMode>("quantity");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderForm[]>([createPurchaseOrder()]);
  const [cartonPlanGroups, setCartonPlanGroups] = useState<CartonPlanGroupForm[]>([createCartonPlanGroup()]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const quantityModeTotal = useMemo(() => purchaseOrders.reduce((sum, order) => sum + orderTotal(order), 0), [purchaseOrders]);
  const cartonModeTotal = useMemo(() => cartonPlanGroups.reduce((sum, group) => sum + cartonGroupTotal(group), 0), [cartonPlanGroups]);
  const cartonModeCount = useMemo(() => new Set(cartonPlanGroups.flatMap((group) => cartonGroupNos(group))).size, [cartonPlanGroups]);
  const totalQuantity = reservationMode === "carton" ? cartonModeTotal : quantityModeTotal;

  function updateCartonGroup(groupId: string, key: keyof Omit<CartonPlanGroupForm, "id" | "items">, value: string) {
    setCartonPlanGroups((current) => current.map((group) => (group.id === groupId ? { ...group, [key]: value } : group)));
  }

  function addCartonGroup() {
    setCartonPlanGroups((current) => [...current, createCartonPlanGroup()]);
  }

  function removeCartonGroup(groupId: string) {
    setCartonPlanGroups((current) => (current.length === 1 ? current : current.filter((group) => group.id !== groupId)));
  }

  function updateCartonPlanItem(groupId: string, itemId: string, key: keyof Omit<CartonPlanItemForm, "id">, value: string) {
    setCartonPlanGroups((current) =>
      current.map((group) =>
        group.id === groupId ? { ...group, items: group.items.map((item) => (item.id === itemId ? { ...item, [key]: value } : item)) } : group
      )
    );
  }

  function addCartonPlanItem(groupId: string) {
    setCartonPlanGroups((current) => current.map((group) => (group.id === groupId ? { ...group, items: [...group.items, createCartonPlanItem()] } : group)));
  }

  function removeCartonPlanItem(groupId: string, itemId: string) {
    setCartonPlanGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, items: group.items.length === 1 ? group.items : group.items.filter((item) => item.id !== itemId) } : group))
    );
  }

  function updatePurchaseOrder(orderId: string, value: string) {
    setPurchaseOrders((current) => current.map((order) => (order.id === orderId ? { ...order, po_number: value } : order)));
  }

  function updateStyle(orderId: string, styleId: string, value: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, styles: order.styles.map((style) => (style.id === styleId ? { ...style, sku: value } : style)) } : order
      )
    );
  }

  function updateColor(orderId: string, styleId: string, colorId: string, value: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              styles: order.styles.map((style) =>
                style.id === styleId ? { ...style, colors: style.colors.map((color) => (color.id === colorId ? { ...color, color: value } : color)) } : style
              )
            }
          : order
      )
    );
  }

  function updateSize(orderId: string, styleId: string, colorId: string, sizeId: string, key: keyof Omit<SizeForm, "id">, value: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              styles: order.styles.map((style) =>
                style.id === styleId
                  ? {
                      ...style,
                      colors: style.colors.map((color) =>
                        color.id === colorId
                          ? {
                              ...color,
                              sizes: color.sizes.map((size) => {
                                if (size.id !== sizeId) return size;
                                const next = { ...size, [key]: value };
                                if (key === "carton_count" || key === "quantity_per_carton") {
                                  const cartonCount = Number(key === "carton_count" ? value : next.carton_count);
                                  const quantityPerCarton = Number(key === "quantity_per_carton" ? value : next.quantity_per_carton);
                                  if (cartonCount > 0 && quantityPerCarton > 0) next.quantity = String(cartonCount * quantityPerCarton);
                                }
                                return next;
                              })
                            }
                          : color
                      )
                    }
                  : style
              )
            }
          : order
      )
    );
  }

  function addPurchaseOrder() {
    setPurchaseOrders((current) => [...current, createPurchaseOrder()]);
  }

  function removePurchaseOrder(orderId: string) {
    setPurchaseOrders((current) => (current.length === 1 ? current : current.filter((order) => order.id !== orderId)));
  }

  function addStyle(orderId: string) {
    setPurchaseOrders((current) => current.map((order) => (order.id === orderId ? { ...order, styles: [...order.styles, createStyle()] } : order)));
  }

  function removeStyle(orderId: string, styleId: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, styles: order.styles.length === 1 ? order.styles : order.styles.filter((style) => style.id !== styleId) }
          : order
      )
    );
  }

  function addColor(orderId: string, styleId: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, styles: order.styles.map((style) => (style.id === styleId ? { ...style, colors: [...style.colors, createColor()] } : style)) } : order
      )
    );
  }

  function removeColor(orderId: string, styleId: string, colorId: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              styles: order.styles.map((style) =>
                style.id === styleId ? { ...style, colors: style.colors.length === 1 ? style.colors : style.colors.filter((color) => color.id !== colorId) } : style
              )
            }
          : order
      )
    );
  }

  function addSize(orderId: string, styleId: string, colorId: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              styles: order.styles.map((style) =>
                style.id === styleId
                  ? { ...style, colors: style.colors.map((color) => (color.id === colorId ? { ...color, sizes: [...color.sizes, createSize()] } : color)) }
                  : style
              )
            }
          : order
      )
    );
  }

  function removeSize(orderId: string, styleId: string, colorId: string, sizeId: string) {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              styles: order.styles.map((style) =>
                style.id === styleId
                  ? {
                      ...style,
                      colors: style.colors.map((color) =>
                        color.id === colorId ? { ...color, sizes: color.sizes.length === 1 ? color.sizes : color.sizes.filter((size) => size.id !== sizeId) } : color
                      )
                    }
                  : style
              )
            }
          : order
      )
    );
  }

  function pickAttachments(event: ChangeEvent<HTMLInputElement>) {
    setAttachments((current) => [...current, ...Array.from(event.target.files ?? [])]);
    event.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const quantityFlatItems = purchaseOrders.flatMap((order) =>
      order.styles.flatMap((style) =>
        style.colors.flatMap((color) =>
          color.sizes.map((size) => ({
            po_number: order.po_number.trim(),
            sku: style.sku.trim(),
            color: color.color.trim() || "未定",
            size: size.size.trim() || "未定",
            carton_count: Number(size.carton_count || 0),
            quantity_per_carton: Number(size.quantity_per_carton || 10),
            quantity: Number(size.quantity)
          }))
        )
      )
    );

    const flatItems = reservationMode === "carton" ? summarizeCartonItems(cartonPlanGroups) : quantityFlatItems;
    const hasInvalidItem = flatItems.some((item) => !item.po_number || !item.sku || item.quantity <= 0);
    const hasInvalidCartonPlan =
      reservationMode === "carton" &&
      cartonPlanGroups.some((group) => cartonGroupNos(group).length === 0 || group.items.some((item) => !item.po_number.trim() || !item.sku.trim() || Number(item.quantity || 0) <= 0));

    if (!form.customer_name.trim() || !form.factory_name.trim()) {
      setError("请填写客户名称和工厂名称。");
      return;
    }

    if (hasInvalidItem) {
      setError("请填写订单号、货号和总双数。颜色和尺码不知道时可以先不填。");
      return;
    }

    if (hasInvalidCartonPlan) {
      setError("请填写箱号范围、订单号、货号和每箱数量。颜色和尺码不知道时可以先不填。");
      return;
    }

    setSaving(true);
    setError("");

    const uniquePoNumbers = Array.from(new Set(flatItems.map((item) => item.po_number)));
    const uniqueSkus = Array.from(new Set(flatItems.map((item) => item.sku)));
    const uniqueColors = Array.from(new Set(flatItems.map((item) => item.color)));
    const uniqueSizes = Array.from(new Set(flatItems.map((item) => item.size)));

    const { data, error: insertError } = await createOrder({
      order_type: "reservation",
      customer_name: form.customer_name.trim(),
      factory_name: form.factory_name.trim(),
      inbound_date: form.inbound_date || null,
      shipping_date: form.shipping_date || null,
      inspection_plan: form.inspection_plan,
      reservation_remark: form.reservation_remark.trim() || null,
      po_number: uniquePoNumbers.length === 1 ? uniquePoNumbers[0] : "多订单号",
      sku: uniqueSkus.length === 1 ? uniqueSkus[0] : "多货号",
      color: uniqueColors.length === 1 ? uniqueColors[0] : "多颜色",
      size: uniqueSizes.length === 1 ? uniqueSizes[0] : "多尺码",
      quantity: totalQuantity,
      inbound_quantity: 0,
      status: "未开始",
      user_id: user.id
    });

    if (insertError) {
      setSaving(false);
      setError(`${insertError.message}。请重新执行最新 supabase/schema.sql。`);
      return;
    }

    const orderId = data.id;
    const { error: itemError } = await insertOrderItems(flatItems.map((item) => ({ order_id: orderId, user_id: user.id, ...item, inbound_quantity: 0 })));

    if (itemError) {
      setSaving(false);
      setError(`${itemError.message}。请确认 Supabase 已执行最新 schema.sql。`);
      return;
    }

    if (reservationMode === "carton") {
      const cartonRows = Array.from(new Set(cartonPlanGroups.flatMap((group) => cartonGroupNos(group)))).map((cartonNo) => ({
        id: createId(),
        order_id: orderId,
        user_id: user.id,
        carton_no: cartonNo,
        remark: null
      }));
      const cartonIdByNo = new Map(cartonRows.map((carton) => [carton.carton_no, carton.id]));
      const cartonItemRows = cartonPlanGroups.flatMap((group) =>
        cartonGroupNos(group).flatMap((cartonNo) =>
          group.items.map((item) => ({
            reservation_carton_id: cartonIdByNo.get(cartonNo)!,
            order_id: orderId,
            user_id: user.id,
            po_number: item.po_number.trim(),
            sku: item.sku.trim(),
            color: item.color.trim() || "未定",
            size: item.size.trim() || "未定",
            quantity: Number(item.quantity || 0)
          }))
        )
      );

      const { error: cartonError } = await insertReservationCartonPlan(cartonRows, cartonItemRows);
      if (cartonError) {
        setSaving(false);
        if (/duplicate key|reservation_cartons_order_id_carton_no_key/i.test(cartonError.message)) {
          setError("这个订单里已经保存过相同箱号。请检查是否重复提交，或重新进入订单查看。");
        } else {
          setError(`${cartonError.message}。请先执行最新的预约箱号数据库 SQL。`);
        }
        return;
      }
    }

    if (attachments.length > 0) {
      const attachmentRows = [];
      for (const file of attachments) {
        const path = `${user.id}/${orderId}/${createId()}-${safeFileName(file.name)}`;
        const { data: uploadData, error: uploadError } = await uploadOrderAttachmentFile(path, file);
        if (uploadError) {
          setSaving(false);
          setError(`${uploadError.message}。请确认 Supabase 存储桶策略已创建，或稍后重新上传。`);
          return;
        }

        attachmentRows.push({
          order_id: orderId,
          user_id: user.id,
          file_name: file.name,
          file_url: uploadData?.publicUrl ?? "",
          file_path: uploadData?.path ?? path,
          mime_type: file.type || null,
          file_size: file.size || null
        });
      }

      const { error: attachmentError } = await insertOrderAttachments(attachmentRows);
      if (attachmentError) {
        setSaving(false);
        setError(`${attachmentError.message}。请确认 Supabase 已执行最新 schema.sql。`);
        return;
      }
    }

    setSaving(false);
    router.push("/orders");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <PackageSearch size={14} />
          预约检品
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">创建预约总单</h1>
        <p className="mt-1 text-sm text-blue-700">按客户、工厂、日期建立总单，再按订单号、货号、颜色、尺码录入明细。</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <section className="panel space-y-4 p-4">
          <h2 className="text-base font-black">客户 / 工厂 / 日期</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="customer_name">客户名称</label>
              <input id="customer_name" className="field mt-2" value={form.customer_name} onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))} required />
            </div>
            <div>
              <label className="label" htmlFor="factory_name">工厂名称</label>
              <input id="factory_name" className="field mt-2" value={form.factory_name} onChange={(event) => setForm((current) => ({ ...current, factory_name: event.target.value }))} required />
            </div>
            <div>
              <label className="label" htmlFor="inbound_date">预约日期</label>
              <input id="inbound_date" className="field mt-2" type="date" value={form.inbound_date} onChange={(event) => setForm((current) => ({ ...current, inbound_date: event.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="shipping_date">出货日期</label>
              <input id="shipping_date" className="field mt-2" type="date" value={form.shipping_date} onChange={(event) => setForm((current) => ({ ...current, shipping_date: event.target.value }))} />
            </div>
          </div>
        </section>

        <section className="panel space-y-4 p-4">
          <h2 className="text-base font-black">检品要求</h2>
          <div>
            <label className="label" htmlFor="inspection_plan">检品类型</label>
            <select
              id="inspection_plan"
              className="field mt-2"
              value={form.inspection_plan}
              onChange={(event) => setForm((current) => ({ ...current, inspection_plan: event.target.value as InspectionPlan }))}
            >
              <option value="normal">只做检品</option>
              <option value="xray">只做 X 光</option>
              <option value="both">检品和 X 光都要</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="reservation_remark">订单备注 / 工人提示</label>
            <textarea
              id="reservation_remark"
              className="field mt-2 min-h-24"
              value={form.reservation_remark}
              onChange={(event) => setForm((current) => ({ ...current, reservation_remark: event.target.value }))}
              placeholder="例如：重点看鞋面色差；D26A3 先检黑色；X 光注意金属异物。"
            />
          </div>
        </section>

        <section className="panel space-y-3 p-4">
          <h2 className="text-base font-black">预约方式</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReservationMode("quantity")}
              className={`min-h-12 rounded border px-3 py-2 text-sm font-black ${reservationMode === "quantity" ? "border-blue-600 bg-blue-600 text-white" : "border-line bg-white text-blue-950"}`}
            >
              数量预约
            </button>
            <button
              type="button"
              onClick={() => setReservationMode("carton")}
              className={`min-h-12 rounded border px-3 py-2 text-sm font-black ${reservationMode === "carton" ? "border-blue-600 bg-blue-600 text-white" : "border-line bg-white text-blue-950"}`}
            >
              箱号预约
            </button>
          </div>
          <p className="text-xs font-bold text-blue-700">
            {reservationMode === "carton" ? `已录入 ${cartonModeCount} 箱，预约总数 ${cartonModeTotal} 双` : `预约总数 ${quantityModeTotal} 双`}
          </p>
        </section>

        {reservationMode === "quantity" && (
        <section className="panel space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black">订单号 / 货号 / 颜色 / 尺码明细</h2>
              <p className="mt-1 text-xs text-slate-500">预约总数：{totalQuantity} 双</p>
            </div>
            <button type="button" onClick={addPurchaseOrder} className="secondary-btn min-h-10 px-3 py-2">
              <Plus size={16} />
              加订单号
            </button>
          </div>

          <div className="space-y-4">
            {purchaseOrders.map((order, orderIndex) => (
              <article key={order.id} className="rounded border border-blue-200 bg-blue-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Layers3 size={18} className="shrink-0 text-machine" />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black">订单号组 {orderIndex + 1}</h3>
                      <p className="text-xs font-bold text-blue-700">本订单号合计：{orderTotal(order)} 双</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => removePurchaseOrder(order.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-white text-slate-500" aria-label="删除订单号">
                    <Trash2 size={16} />
                  </button>
                </div>

                <div>
                  <label className="label" htmlFor={`po-${order.id}`}>订单号</label>
                  <input id={`po-${order.id}`} className="field mt-2" value={order.po_number} onChange={(event) => updatePurchaseOrder(order.id, event.target.value)} required />
                </div>

                <div className="mt-3 space-y-3">
                  {order.styles.map((style, styleIndex) => (
                    <section key={style.id} className="rounded border border-line bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black">货号 {styleIndex + 1}</h4>
                          <p className="text-xs font-bold text-blue-700">本货号合计：{styleTotal(style)} 双</p>
                        </div>
                        <button type="button" onClick={() => removeStyle(order.id, style.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line text-slate-500" aria-label="删除货号">
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div>
                        <label className="label" htmlFor={`sku-${style.id}`}>货号</label>
                        <input id={`sku-${style.id}`} className="field mt-2" value={style.sku} onChange={(event) => updateStyle(order.id, style.id, event.target.value)} required />
                      </div>

                      <div className="mt-3 space-y-3">
                        {style.colors.map((color, colorIndex) => (
                          <section key={color.id} className="rounded border border-blue-200 bg-blue-50 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div>
                                <h5 className="text-sm font-black">颜色 {colorIndex + 1}</h5>
                                <p className="text-xs font-bold text-blue-700">本颜色合计：{colorTotal(color)} 双</p>
                              </div>
                              <button type="button" onClick={() => removeColor(order.id, style.id, color.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-white text-slate-500" aria-label="删除颜色">
                                <Trash2 size={15} />
                              </button>
                            </div>

                            <div>
                              <label className="label" htmlFor={`color-${color.id}`}>颜色 <span className="text-xs text-slate-400">可不填</span></label>
                              <input id={`color-${color.id}`} className="field mt-2" value={color.color} onChange={(event) => updateColor(order.id, style.id, color.id, event.target.value)} placeholder="不知道可先空着" />
                            </div>

                            <div className="mt-3 space-y-2">
                              {color.sizes.map((size, sizeIndex) => (
                                <div key={size.id} className="grid gap-2 rounded border border-line bg-white p-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="label" htmlFor={`size-${size.id}`}>尺码 {sizeIndex + 1} <span className="text-xs text-slate-400">可不填</span></label>
                                      <input id={`size-${size.id}`} className="field mt-2" value={size.size} onChange={(event) => updateSize(order.id, style.id, color.id, size.id, "size", event.target.value)} placeholder="不知道可先空着" />
                                    </div>
                                    <div>
                                      <label className="label" htmlFor={`carton-${size.id}`}>预约箱数</label>
                                      <input id={`carton-${size.id}`} className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={0} value={size.carton_count} onChange={(event) => updateSize(order.id, style.id, color.id, size.id, "carton_count", event.target.value)} placeholder="0" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-[1fr_1fr_40px] items-end gap-2">
                                    <div>
                                      <label className="label" htmlFor={`per-carton-${size.id}`}>入数</label>
                                      <input id={`per-carton-${size.id}`} className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={0} value={size.quantity_per_carton} onChange={(event) => updateSize(order.id, style.id, color.id, size.id, "quantity_per_carton", event.target.value)} placeholder="10" />
                                    </div>
                                    <div>
                                      <label className="label" htmlFor={`qty-${size.id}`}>总双数</label>
                                      <input id={`qty-${size.id}`} className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={1} value={size.quantity} onChange={(event) => updateSize(order.id, style.id, color.id, size.id, "quantity", event.target.value)} required />
                                    </div>
                                    <button type="button" onClick={() => removeSize(order.id, style.id, color.id, size.id)} className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded border border-line text-slate-500" aria-label="删除尺码">
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <button type="button" onClick={() => addSize(order.id, style.id, color.id)} className="secondary-btn mt-3 min-h-10 w-full">
                              <Plus size={16} />
                              加尺码
                            </button>
                          </section>
                        ))}
                      </div>

                      <button type="button" onClick={() => addColor(order.id, style.id)} className="secondary-btn mt-3 min-h-10 w-full">
                        <Plus size={16} />
                        加颜色
                      </button>
                    </section>
                  ))}
                </div>

                <button type="button" onClick={() => addStyle(order.id)} className="secondary-btn mt-3 min-h-10 w-full">
                  <Plus size={16} />
                  加货号
                </button>
              </article>
            ))}
          </div>
        </section>
        )}

        {reservationMode === "carton" && (
          <section className="panel space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black">箱号预约明细</h2>
                <p className="mt-1 text-xs text-slate-500">同一批箱号内容相同时，填写箱号从几到几，系统会自动展开和统计。</p>
              </div>
              <button type="button" onClick={addCartonGroup} className="secondary-btn min-h-10 px-3 py-2">
                <Plus size={16} />
                加箱号范围
              </button>
            </div>

            <div className="space-y-4">
              {cartonPlanGroups.map((group, groupIndex) => (
                <article key={group.id} className="rounded border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black">箱号范围 {groupIndex + 1}</h3>
                      <p className="text-xs font-bold text-blue-700">
                        {cartonGroupNos(group).length} 箱 / 本范围合计 {cartonGroupTotal(group)} 双
                      </p>
                    </div>
                    <button type="button" onClick={() => removeCartonGroup(group.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-white text-slate-500" aria-label="删除箱号范围">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="label">箱号从</span>
                      <input className="field mt-2" value={group.carton_start} onChange={(event) => updateCartonGroup(group.id, "carton_start", event.target.value)} placeholder="例如 1 / A001" />
                    </label>
                    <label>
                      <span className="label">箱号到</span>
                      <input className="field mt-2" value={group.carton_end} onChange={(event) => updateCartonGroup(group.id, "carton_end", event.target.value)} placeholder="例如 10 / A010" />
                    </label>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.items.map((item, itemIndex) => (
                      <div key={item.id} className="grid gap-2 rounded border border-line bg-white p-2">
                        <p className="text-xs font-black text-blue-700">箱内明细 {itemIndex + 1}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="field" value={item.po_number} onChange={(event) => updateCartonPlanItem(group.id, item.id, "po_number", event.target.value)} placeholder="订单号" />
                          <input className="field" value={item.sku} onChange={(event) => updateCartonPlanItem(group.id, item.id, "sku", event.target.value)} placeholder="货号" />
                          <input className="field" value={item.color} onChange={(event) => updateCartonPlanItem(group.id, item.id, "color", event.target.value)} placeholder="颜色，可不填" />
                          <input className="field" value={item.size} onChange={(event) => updateCartonPlanItem(group.id, item.id, "size", event.target.value)} placeholder="尺码，可不填" />
                        </div>
                        <div className="grid grid-cols-[1fr_40px] items-end gap-2">
                          <label>
                            <span className="label">每箱数量</span>
                            <input className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={1} value={item.quantity} onChange={(event) => updateCartonPlanItem(group.id, item.id, "quantity", event.target.value)} />
                          </label>
                          <button type="button" onClick={() => removeCartonPlanItem(group.id, item.id)} className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded border border-line text-slate-500" aria-label="删除箱内明细">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => addCartonPlanItem(group.id)} className="secondary-btn mt-3 min-h-10 w-full">
                    <Plus size={16} />
                    加箱内明细
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="panel p-4">
          <h2 className="text-base font-black">检品指示书</h2>
          <p className="mt-1 text-xs text-slate-500">可上传图片、Excel 或 PDF，开始检品时会显示在订单下面。</p>
          <label className="mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-line bg-blue-50 p-3 text-center">
            <Upload size={26} className="text-machine" />
            <span className="mt-2 text-sm font-bold text-slate-600">导入图片 / Excel / PDF</span>
            <input type="file" multiple accept="image/*,.xlsx,.xls,.csv,.pdf" className="sr-only" onChange={pickAttachments} />
          </label>

          {attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachments.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded border border-line bg-white px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileSpreadsheet size={16} className="shrink-0 text-machine" />
                    <span className="truncate font-bold">{file.name}</span>
                  </div>
                  <button type="button" onClick={() => removeAttachment(index)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-slate-500" aria-label="删除附件">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

        <button type="submit" className="primary-btn w-full" disabled={saving || totalQuantity <= 0}>
          <Save size={18} />
          保存预约总单：{totalQuantity} 双
        </button>
      </form>
    </div>
  );
}
