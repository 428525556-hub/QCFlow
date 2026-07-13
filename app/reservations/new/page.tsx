"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import type { InspectionPlan } from "@/lib/types";
import { getOrderAttachmentPublicUrl, insertOrderAttachments, uploadOrderAttachment } from "@/src/api/orderAttachmentsApi";
import { createOrder, insertOrderItems } from "@/src/api/ordersApi";
import { FileSpreadsheet, PackageSearch, Palette, Plus, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type SizeForm = { id: string; size: string; carton_count: string; quantity_per_carton: string; quantity: string };
type ColorForm = { id: string; po_number: string; sku: string; color: string; sizes: SizeForm[] };
type ReservationForm = { customer_name: string; factory_name: string; inbound_date: string; shipping_date: string; inspection_plan: InspectionPlan; reservation_remark: string };

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSize(): SizeForm {
  return { id: createId(), size: "", carton_count: "", quantity_per_carton: "10", quantity: "" };
}

function createColor(): ColorForm {
  return { id: createId(), po_number: "", sku: "", color: "", sizes: [createSize()] };
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
}

function sizeTotal(sizes: SizeForm[]) {
  return sizes.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export default function NewReservationPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [form, setForm] = useState<ReservationForm>({ customer_name: "", factory_name: "", inbound_date: "", shipping_date: "", inspection_plan: "both", reservation_remark: "" });
  const [colors, setColors] = useState<ColorForm[]>([createColor()]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalQuantity = useMemo(() => colors.reduce((sum, color) => sum + sizeTotal(color.sizes), 0), [colors]);

  function updateColor(colorId: string, key: keyof Omit<ColorForm, "id" | "sizes">, value: string) {
    setColors((current) => current.map((color) => (color.id === colorId ? { ...color, [key]: value } : color)));
  }

  function updateSize(colorId: string, sizeId: string, key: keyof Omit<SizeForm, "id">, value: string) {
    setColors((current) =>
      current.map((color) =>
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
    );
  }

  function addColor() {
    setColors((current) => {
      const last = current[current.length - 1];
      return [...current, { ...createColor(), po_number: last?.po_number ?? "", sku: last?.sku ?? "" }];
    });
  }

  function removeColor(colorId: string) {
    setColors((current) => (current.length === 1 ? current : current.filter((color) => color.id !== colorId)));
  }

  function addSize(colorId: string) {
    setColors((current) => current.map((color) => (color.id === colorId ? { ...color, sizes: [...color.sizes, createSize()] } : color)));
  }

  function removeSize(colorId: string, sizeId: string) {
    setColors((current) =>
      current.map((color) =>
        color.id === colorId ? { ...color, sizes: color.sizes.length === 1 ? color.sizes : color.sizes.filter((size) => size.id !== sizeId) } : color
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

    const cleanColors = colors.map((color) => ({
      po_number: color.po_number.trim(),
      sku: color.sku.trim(),
      color: color.color.trim() || "未定",
      sizes: color.sizes.map((size) => ({
        size: size.size.trim() || "未定",
        carton_count: Number(size.carton_count || 0),
        quantity_per_carton: Number(size.quantity_per_carton || 10),
        quantity: Number(size.quantity)
      }))
    }));
    const hasInvalidColor = cleanColors.some((color) => !color.po_number || !color.sku);
    const hasInvalidSize = cleanColors.some((color) => color.sizes.some((size) => size.quantity <= 0));

    if (!form.customer_name.trim() || !form.factory_name.trim()) {
      setError("请填写客户名称和工厂名称。");
      return;
    }

    if (hasInvalidColor || hasInvalidSize) {
      setError("请填写订单号、番号和预约数量。颜色和尺码不知道时可以先不填。");
      return;
    }

    setSaving(true);
    setError("");

    const flatItems = cleanColors.flatMap((color) =>
      color.sizes.map((size) => ({
        po_number: color.po_number,
        sku: color.sku,
        color: color.color,
        size: size.size,
        carton_count: size.carton_count,
        quantity_per_carton: size.quantity_per_carton,
        quantity: size.quantity
      }))
    );
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
        sku: uniqueSkus.length === 1 ? uniqueSkus[0] : "多番号",
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
    const { error: itemError } = await insertOrderItems(
      flatItems.map((item) => ({ order_id: orderId, user_id: user.id, ...item, inbound_quantity: 0 }))
    );

    if (itemError) {
      setSaving(false);
      setError(`${itemError.message}。请确认 Supabase 已执行最新 schema.sql。`);
      return;
    }

    if (attachments.length > 0) {
      const attachmentRows = [];
      for (const file of attachments) {
        const path = `${user.id}/${orderId}/${createId()}-${safeFileName(file.name)}`;
        const { error: uploadError } = await uploadOrderAttachment(path, file);
        if (uploadError) {
          setSaving(false);
          setError(`${uploadError.message}。请确认 order-attachments 存储桶已创建。`);
          return;
        }

        const publicUrl = getOrderAttachmentPublicUrl(path);
        attachmentRows.push({ order_id: orderId, user_id: user.id, file_name: file.name, file_url: publicUrl, file_path: path, mime_type: file.type || null, file_size: file.size || null });
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
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <PackageSearch size={14} />
          预约检品
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">创建预约检品总订单</h1>
        <p className="mt-1 text-sm text-blue-700">先录入总订单。后续货到时，再按颜色、尺码分批入库。</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <section className="panel space-y-4 p-4">
          <h2 className="text-base font-black">客户和日期</h2>
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
              <label className="label" htmlFor="inbound_date">预计来货日期</label>
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black">总订单颜色尺码</h2>
              <p className="mt-1 text-xs text-slate-500">预约总数：{totalQuantity} 双</p>
            </div>
            <button type="button" onClick={addColor} className="secondary-btn min-h-10 px-3 py-2"><Plus size={16} />加颜色</button>
          </div>

          <div className="space-y-4">
            {colors.map((color, colorIndex) => {
              const colorTotal = sizeTotal(color.sizes);
              return (
                <article key={color.id} className="rounded border border-line bg-blue-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Palette size={18} className="shrink-0 text-machine" />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black">颜色组 {colorIndex + 1}</h3>
                        <p className="text-xs font-bold text-blue-700">本颜色合计：{colorTotal} 双</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeColor(color.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-white text-slate-500" aria-label="删除颜色"><Trash2 size={16} /></button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="label" htmlFor={`po-${color.id}`}>订单号</label>
                      <input id={`po-${color.id}`} className="field mt-2" value={color.po_number} onChange={(event) => updateColor(color.id, "po_number", event.target.value)} required />
                    </div>
                    <div>
                      <label className="label" htmlFor={`sku-${color.id}`}>番号</label>
                      <input id={`sku-${color.id}`} className="field mt-2" value={color.sku} onChange={(event) => updateColor(color.id, "sku", event.target.value)} required />
                    </div>
                    <div>
                      <label className="label" htmlFor={`color-${color.id}`}>颜色 <span className="text-xs text-slate-400">可不填</span></label>
                      <input id={`color-${color.id}`} className="field mt-2" value={color.color} onChange={(event) => updateColor(color.id, "color", event.target.value)} placeholder="不知道可先空着" />
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {color.sizes.map((size, sizeIndex) => (
                      <div key={size.id} className="grid gap-2 rounded border border-line bg-white p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label" htmlFor={`size-${size.id}`}>尺码 {sizeIndex + 1} <span className="text-xs text-slate-400">可不填</span></label>
                            <input id={`size-${size.id}`} className="field mt-2" value={size.size} onChange={(event) => updateSize(color.id, size.id, "size", event.target.value)} placeholder="不知道可先空着" />
                          </div>
                          <div>
                            <label className="label" htmlFor={`carton-${size.id}`}>预约箱数</label>
                            <input id={`carton-${size.id}`} className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={0} value={size.carton_count} onChange={(event) => updateSize(color.id, size.id, "carton_count", event.target.value)} placeholder="0" />
                          </div>
                        </div>
                        <div className="grid grid-cols-[1fr_1fr_40px] items-end gap-2">
                          <div>
                            <label className="label" htmlFor={`per-carton-${size.id}`}>入数</label>
                            <input id={`per-carton-${size.id}`} className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={0} value={size.quantity_per_carton} onChange={(event) => updateSize(color.id, size.id, "quantity_per_carton", event.target.value)} placeholder="10" />
                          </div>
                          <div>
                            <label className="label" htmlFor={`qty-${size.id}`}>总双数</label>
                            <input id={`qty-${size.id}`} className="field mt-2 text-lg font-black" type="number" inputMode="numeric" min={1} value={size.quantity} onChange={(event) => updateSize(color.id, size.id, "quantity", event.target.value)} required />
                          </div>
                          <button type="button" onClick={() => removeSize(color.id, size.id)} className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded border border-line text-slate-500" aria-label="删除尺码"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => addSize(color.id)} className="secondary-btn mt-3 min-h-10 w-full"><Plus size={16} />加尺码</button>
                </article>
              );
            })}
          </div>
        </section>

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
                  <div className="flex min-w-0 items-center gap-2"><FileSpreadsheet size={16} className="shrink-0 text-machine" /><span className="truncate font-bold">{file.name}</span></div>
                  <button type="button" onClick={() => removeAttachment(index)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-slate-500" aria-label="删除附件"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

        <button type="submit" className="primary-btn w-full" disabled={saving || totalQuantity <= 0}><Save size={18} />保存预约总订单：{totalQuantity} 双</button>
      </form>
    </div>
  );
}
