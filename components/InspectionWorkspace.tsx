"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { getInspectionPhotoPublicUrl, getInspectionWorkspaceData, insertInspectionRecord, uploadInspectionPhoto } from "@/src/api/inspectionApi";
import { insertOrderAttachments, uploadOrderAttachmentFile } from "@/src/api/orderAttachmentsApi";
import { updateOrder } from "@/src/api/ordersApi";
import { compressImageFile, createSafeId, formatMb, safeFileName, withTimeout } from "@/src/utils";
import type { DefectGroup, InspectionRecord, InspectionStage, Order, OrderAttachment, OrderItem } from "@/lib/types";
import { Camera, CheckCircle2, ExternalLink, FileSpreadsheet, FileText, Minus, Plus, Save, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Props = {
  orderId: string;
  stage: InspectionStage;
  title: string;
  subtitle: string;
  groups: DefectGroup[];
};

function planLabel(plan?: string | null) {
  if (plan === "normal") return "只做检品";
  if (plan === "xray") return "只做 X 光";
  return "检品和 X 光都要";
}

function stageMismatch(plan: string | null | undefined, stage: InspectionStage) {
  return (plan === "normal" && stage === "xray") || (plan === "xray" && stage === "normal");
}

export function InspectionWorkspace({ orderId, stage, title, subtitle, groups }: Props) {
  const router = useRouter();
  const user = useCurrentUser();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [defectType, setDefectType] = useState(groups[0]?.items[0] ?? "其他");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [remark, setRemark] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await getInspectionWorkspaceData(orderId, stage);
      const typedOrder = data.order as Order | null;
      const typedItems = (data.items ?? []) as OrderItem[];
      setOrder(typedOrder);
      setItems(typedItems);
      setRecords((data.records ?? []) as InspectionRecord[]);
      setAttachments((data.attachments ?? []) as OrderAttachment[]);
      setSelectedColor((current) => current || typedItems[0]?.color || typedOrder?.color || "");
      setSelectedSize((current) => current || typedItems[0]?.size || typedOrder?.size || "");

      if (typedOrder?.status === "未开始") {
        await updateOrder(orderId, { status: "检品中" });
        setOrder({ ...typedOrder, status: "检品中" });
      }
    }

    load();
  }, [orderId, stage]);

  const defectQty = useMemo(() => records.reduce((sum, record) => sum + record.quantity, 0), [records]);
  const colors = useMemo(() => Array.from(new Set(items.map((item) => item.color).filter(Boolean))), [items]);
  const sizes = useMemo(() => {
    const source = selectedColor ? items.filter((item) => item.color === selectedColor) : items;
    return Array.from(new Set(source.map((item) => item.size).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
  }, [items, selectedColor]);

  function changeColor(color: string) {
    setSelectedColor(color);
    setSelectedSize(items.find((item) => item.color === color)?.size ?? "");
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setPreview("");
    setPhoto(null);
    setMessage("");
    event.target.value = "";

    if (!file) {
      setUploadStatus("");
      return;
    }

    setPhotoProcessing(true);
    setUploadStatus(`正在压缩照片... 原图 ${formatMb(file.size)}`);

    try {
      const compressed = await withTimeout(
        compressImageFile(file, { maxSide: 800, quality: 0.45, fileName: `${file.name.replace(/\.[^.]+$/, "") || "inspection-photo"}-compressed.jpg` }),
        8000,
        "照片压缩超时，请重新拍一张或换一张图片"
      );
      setPhoto(compressed);
      setPreview(URL.createObjectURL(compressed));
      setMessage(`照片已压缩：${formatMb(file.size)} → ${formatMb(compressed.size)}，现在保存会更快。`);
      setUploadStatus("");
    } catch {
      setPhoto(file);
      setPreview(URL.createObjectURL(file));
      setMessage("这张照片无法自动压缩，已保留原图。建议手机相机选择较小尺寸后再拍。");
      setUploadStatus("");
    } finally {
      setPhotoProcessing(false);
    }
  }

  async function pickInstructionFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!user) {
      setMessage("登录状态已失效，请重新登录后再上传。");
      return;
    }

    if (files.length === 0 || attachmentUploading) return;

    setAttachmentUploading(true);
    setAttachmentStatus(`正在上传指示书... 0/${files.length}`);
    setMessage("");

    try {
      const uploadedRows: OrderAttachment[] = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const uploadFile = file.type.startsWith("image/")
          ? await compressImageFile(file, { maxSide: 1400, quality: 0.62, fileName: `${file.name.replace(/\.[^.]+$/, "") || "instruction"}-compressed.jpg` })
          : file;
        setAttachmentStatus(`正在上传指示书... ${index + 1}/${files.length} ${file.name} ${formatMb(uploadFile.size)}`);
        const path = `${user.id}/${orderId}/${createSafeId()}-${safeFileName(uploadFile.name)}`;

        const { data: uploadData, error: uploadError } = await withTimeout(uploadOrderAttachmentFile(path, uploadFile), 45000, "指示书上传超时，请检查手机网络后重试");

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        uploadedRows.push({
          id: createSafeId(),
          created_at: new Date().toISOString(),
          order_id: orderId,
          user_id: user.id,
          file_name: file.name,
          file_url: uploadData?.publicUrl ?? "",
          file_path: uploadData?.path ?? path,
          mime_type: uploadFile.type || file.type || null,
          file_size: uploadFile.size || file.size || null
        });
      }

      const { data, error } = await withTimeout(
        insertOrderAttachments(uploadedRows.map(({ id, created_at, ...row }) => row)),
        20000,
        "指示书信息保存超时，请检查手机网络后重试"
      );

      if (error) {
        throw new Error(`${error.message}。请确认 Supabase 已执行最新 schema.sql，并创建 order-attachments 存储桶。`);
      }

      setAttachments((current) => [...current, ...((data ?? uploadedRows) as OrderAttachment[])]);
      setMessage("指示书已上传");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`指示书上传失败：${detail}`);
    } finally {
      setAttachmentUploading(false);
      setAttachmentStatus("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setMessage("登录状态已失效，请重新登录后再上传。");
      return;
    }
    if (saving || photoProcessing) return;

    setSaving(true);
    setMessage("");
    setUploadStatus(photo ? `正在上传照片... ${formatMb(photo.size)}` : "正在保存记录...");

    try {
      let photoUrl: string | null = null;
      let photoPath: string | null = null;

      if (photo) {
        const uploadFile = photo;
        setUploadStatus(`正在上传照片... ${formatMb(uploadFile.size)}`);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        photoPath = `${user.id}/${orderId}/${createSafeId()}.${ext}`;
        const { error: uploadError } = await withTimeout(uploadInspectionPhoto(photoPath, uploadFile), 45000, "手机网络上传超时，请确认手机和电脑在同一个 Wi-Fi 后重试");

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        photoUrl = getInspectionPhotoPublicUrl(photoPath);
      }

      setUploadStatus("正在保存记录...");

      const { data, error } = await withTimeout(
        insertInspectionRecord({
          order_id: orderId,
          user_id: user.id,
          inspection_stage: stage,
          color: selectedColor || null,
          size: selectedSize || null,
          defect_type: defectType,
          quantity,
          remark: remark || null,
          photo_url: photoUrl,
          photo_path: photoPath
        }),
        20000,
        "保存记录超时，请检查手机网络后重试"
      );

      if (error) {
        throw new Error(`${error.message}。请确认 Supabase 已执行最新 schema.sql。`);
      }

      setRecords((current) => [data as InspectionRecord, ...current]);
      setQuantity(1);
      setRemark("");
      setPhoto(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      setMessage("已保存");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      setMessage(`保存失败：${detail}`);
    } finally {
      setSaving(false);
      setUploadStatus("");
    }
  }

  async function finishOrder() {
    await updateOrder(orderId, { status: "已完成" });
    router.push(`/report/${orderId}`);
  }

  if (!order) {
    return <div className="panel p-5 text-sm text-slate-500">正在加载任务...</div>;
  }

  return (
    <div className="inspection-workspace mx-auto max-w-3xl space-y-4 pb-28 md:pb-4">
      <section className="inspection-summary rounded border border-blue-900 bg-blue-950 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-sky-300">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black tracking-normal">{order.po_number}</h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-2 text-sm text-blue-100">
              {order.customer_name} · 番号 {order.sku} · 入库 {order.quantity} 件
            </p>
            <p className="mt-1 text-xs text-blue-200">{subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-200">不良数</p>
            <p className="text-2xl font-black text-sky-300">{defectQty}</p>
          </div>
        </div>
      </section>

      <section className="inspection-notice rounded border border-blue-200 bg-blue-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-white px-2 py-1 text-xs font-black text-blue-800">检品类型：{planLabel(order.inspection_plan)}</span>
          {stageMismatch(order.inspection_plan, stage) && (
            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">注意：这个订单预约类型不是当前检验环节</span>
          )}
        </div>
        {order.reservation_remark ? (
          <p className="mt-2 whitespace-pre-wrap text-sm font-bold text-blue-950">{order.reservation_remark}</p>
        ) : (
          <p className="mt-2 text-sm text-blue-700">这个订单没有填写预约备注。</p>
        )}
      </section>

      <section className="inspection-instructions panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">检品指示书</h2>
            <p className="mt-1 text-sm text-slate-500">用于判断哪些项目 OK / NG。</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{attachments.length} 个附件</span>
            <label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded border border-line bg-white px-3 py-2 text-sm font-black text-machine ${attachmentUploading ? "pointer-events-none opacity-60" : ""}`}>
              <Upload size={16} />
              上传
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.xls,.xlsx"
                className="sr-only"
                onChange={pickInstructionFiles}
                disabled={attachmentUploading}
              />
            </label>
          </div>
        </div>

        {attachmentUploading && attachmentStatus && (
          <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-sm font-black text-blue-800">
              <span className="min-w-0 truncate">{attachmentStatus}</span>
              <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-blue-100">
              <div className="h-full w-2/3 animate-pulse rounded bg-blue-600" />
            </div>
          </div>
        )}

        {attachments.length === 0 && <div className="rounded border border-line bg-blue-50 p-3 text-sm text-slate-500">这个订单还没有上传检品指示书。</div>}

        {attachments.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {attachments.map((attachment) => {
              const isImage = attachment.mime_type?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.file_name);
              return (
                <article key={attachment.id} className="overflow-hidden rounded border border-line bg-blue-50">
                  {isImage ? (
                    <a href={attachment.file_url} target="_blank" rel="noreferrer" className="block bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={attachment.file_url} alt={attachment.file_name} className="h-56 w-full object-contain" />
                    </a>
                  ) : (
                    <div className="grid h-32 place-items-center bg-white text-machine">
                      <FileSpreadsheet size={40} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 p-3">
                    <p className="min-w-0 truncate text-sm font-black">{attachment.file_name}</p>
                    <a href={attachment.file_url} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-white text-slate-600" aria-label="打开附件">
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={submit} className="inspection-form panel space-y-4 p-4">
        <div className="inspection-photo-panel">
          <label className="label">现场照片</label>
          <label className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-line bg-blue-50 p-3 text-center">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="检品照片预览" className="max-h-56 rounded object-contain" />
            ) : (
              <>
                <Camera size={30} className="text-blue-500" />
                <span className="mt-2 text-sm font-bold text-slate-600">拍照或选择图片</span>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} />
          </label>
        </div>

        <div className="inspection-defect-panel">
          <label className="label">问题类别</label>
          <div className="inspection-defect-groups mt-2 space-y-3">
            {groups.map((group) => (
              <section key={group.group} className="inspection-defect-group rounded border border-line bg-blue-50 p-2">
                <p className="mb-2 text-xs font-black text-blue-700">{group.group}</p>
                <div className="inspection-defect-items grid grid-cols-2 gap-2 md:grid-cols-3">
                  {group.items.map((item) => (
                    <button
                      key={`${group.group}-${item}`}
                      type="button"
                      onClick={() => setDefectType(item)}
                      className={`inspection-defect-button min-h-11 rounded border px-2 text-sm font-black ${
                        defectType === item ? "border-blue-500 bg-blue-600 text-white" : "border-line bg-white text-slate-600"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="inspection-details-panel">
          <label className="label">数量</label>
          <div className="mb-3 mt-2 grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="label">不良颜色</span>
              <select className="field" value={selectedColor} onChange={(event) => changeColor(event.target.value)}>
                {colors.length === 0 && <option value={selectedColor}>{selectedColor || "未设置颜色"}</option>}
                {colors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">不良尺码</span>
              <select className="field" value={selectedSize} onChange={(event) => setSelectedSize(event.target.value)}>
                {sizes.length === 0 && <option value={selectedSize}>{selectedSize || "未设置尺码"}</option>}
                {sizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid grid-cols-[52px_1fr_52px] overflow-hidden rounded border border-line bg-white">
            <button type="button" className="grid min-h-12 place-items-center border-r border-line" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="减少">
              <Minus size={18} />
            </button>
            <input
              className="w-full text-center text-xl font-black outline-none"
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value || 1)))}
            />
            <button type="button" className="grid min-h-12 place-items-center border-l border-line" onClick={() => setQuantity((value) => value + 1)} aria-label="增加">
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="inspection-remark-panel">
          <label className="label" htmlFor="remark">
            备注
          </label>
          <textarea id="remark" className="field mt-2 min-h-24 resize-none" value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="位置、批次、处理意见" />
        </div>

        {message && <p className="inspection-feedback rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}
        {(saving || photoProcessing) && uploadStatus && (
          <div className="inspection-feedback rounded border border-blue-200 bg-blue-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-sm font-black text-blue-800">
              <span>{uploadStatus}</span>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-blue-100">
              <div className="h-full w-2/3 animate-pulse rounded bg-blue-600" />
            </div>
          </div>
        )}

        <div className="inspection-actions grid grid-cols-2 gap-3">
          <button type="submit" disabled={saving || photoProcessing} className="primary-btn">
            <Save size={18} />
            保存记录
          </button>
          <button type="button" onClick={finishOrder} className="secondary-btn">
            <CheckCircle2 size={18} />
            完成订单
          </button>
        </div>
      </form>

      <section className="inspection-records">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">最近记录</h2>
          <Link href={`/report/${orderId}`} className="inline-flex items-center gap-1 text-sm font-bold text-machine">
            <FileText size={16} />
            报告
          </Link>
        </div>
        <div className="inspection-record-list space-y-3">
          {records.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无记录。</div>}
          {records.map((record) => (
            <article key={record.id} className="panel flex gap-3 p-3">
              {record.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.photo_url} alt={record.defect_type} className="h-20 w-20 shrink-0 rounded object-cover" />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded bg-blue-50 text-blue-400">
                  <Camera size={22} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black">{record.defect_type}</p>
                  <p className="font-black text-machine">x {record.quantity}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{shortDate(record.created_at)}</p>
                {(record.color || record.size) && (
                  <p className="mt-1 text-xs font-bold text-blue-700">
                    {record.color || "-"} / {record.size || "-"}
                  </p>
                )}
                {record.remark && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{record.remark}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
