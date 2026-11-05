import "server-only";

import type { StorageBackend } from "@/src/config/env";
import { ApiError } from "@/src/server/errors";

export type LogicalBucket = "inspection-photos" | "order-attachments";

const BUCKET_ENV = {
  "inspection-photos": "COS_BUCKET_INSPECTION_PHOTOS",
  "order-attachments": "COS_BUCKET_ORDER_ATTACHMENTS"
} as const;

const BASE_URL_ENV = {
  "inspection-photos": "COS_INSPECTION_PHOTOS_BASE_URL",
  "order-attachments": "COS_ORDER_ATTACHMENTS_BASE_URL"
} as const;

function requireCosEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ApiError(`COS 配置缺失：${name}`, 503, "STORAGE_NOT_CONFIGURED");
  return value;
}

export function getStorageBackend(): StorageBackend {
  return process.env.STORAGE_BACKEND === "cos" ? "cos" : "supabase";
}

export function getCosConfig() {
  return {
    SecretId: requireCosEnv("COS_SECRET_ID"),
    SecretKey: requireCosEnv("COS_SECRET_KEY"),
    Region: requireCosEnv("COS_REGION")
  };
}

export function getCosBucket(bucket: LogicalBucket): string {
  return requireCosEnv(BUCKET_ENV[bucket]);
}

export function getCosPublicBaseUrl(bucket: LogicalBucket): string {
  const configured = process.env[BASE_URL_ENV[bucket]]?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return `https://${getCosBucket(bucket)}.cos.${requireCosEnv("COS_REGION")}.myqcloud.com`;
}

export function encodeObjectPath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
