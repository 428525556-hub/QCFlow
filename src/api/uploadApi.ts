import { publicEnv } from "@/src/config/env";

import { apiRequestForm } from "./httpClient";

/** 生成 Storage 公开访问地址（路径已由调用方清洗，保持与 Supabase getPublicUrl 一致） */
export function getStoragePublicUrl(bucket: string, path: string) {
  const base = publicEnv.supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

/** 统一上传入口：走服务端 /api/uploads（服务端用登录用户 JWT 上传，遵守 RLS） */
export async function uploadToStorage(bucket: string, path: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("bucket", bucket);
  form.append("path", path);

  const result = await apiRequestForm<{ path: string; url: string }>("/api/uploads", form);
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("上传失败");
  return result.data;
}
