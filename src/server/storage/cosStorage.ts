import "server-only";

import COS from "cos-nodejs-sdk-v5";

import { ApiError } from "@/src/server/errors";
import {
  encodeObjectPath,
  getCosBucket,
  getCosConfig,
  getCosPublicBaseUrl,
  type LogicalBucket
} from "./config";
import type { StorageAdapter, StorageUploadInput } from "./types";

let client: COS | null = null;

function getClient() {
  if (client) return client;
  client = new COS({
    ...getCosConfig(),
    Timeout: 60_000,
    KeepAlive: true
  });
  return client;
}

function assertBucket(bucket: string): asserts bucket is LogicalBucket {
  if (bucket !== "inspection-photos" && bucket !== "order-attachments") {
    throw new ApiError("bucket is invalid", 400, "VALIDATION_ERROR");
  }
}

function assertPath(path: string) {
  const normalized = path.replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === "..")) {
    throw new ApiError("path is invalid", 400, "VALIDATION_ERROR");
  }
  return normalized;
}

function buildPublicUrl(bucket: LogicalBucket, path: string) {
  return `${getCosPublicBaseUrl(bucket)}/${encodeObjectPath(assertPath(path))}`;
}

export const cosStorage: StorageAdapter = {
  async upload({ bucket, path, file, contentType, cacheControl = "3600" }: StorageUploadInput) {
    assertBucket(bucket);
    const key = assertPath(path);
    const body = Buffer.from(await file.arrayBuffer());

    try {
      await getClient().putObject({
        Bucket: getCosBucket(bucket),
        Region: getCosConfig().Region,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType || "application/octet-stream",
        CacheControl: `public, max-age=${Math.max(0, Number(cacheControl) || 3600)}`,
        Headers: { "x-cos-forbid-overwrite": "true" }
      });
    } catch {
      throw new ApiError("文件上传到 COS 失败", 502, "STORAGE_UPLOAD_FAILED");
    }

    return { path: key, url: buildPublicUrl(bucket, key) };
  },

  getPublicUrl(bucket: string, path: string) {
    assertBucket(bucket);
    return buildPublicUrl(bucket, path);
  },

  async delete(bucket: string, path: string) {
    assertBucket(bucket);
    const key = assertPath(path);
    try {
      await getClient().deleteObject({
        Bucket: getCosBucket(bucket),
        Region: getCosConfig().Region,
        Key: key
      });
    } catch {
      throw new ApiError("删除 COS 文件失败", 502, "STORAGE_DELETE_FAILED");
    }
  }
};
