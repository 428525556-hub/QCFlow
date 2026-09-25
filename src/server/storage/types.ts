export interface StorageUploadInput {
  bucket: string;
  path: string;
  file: Blob | File;
  contentType?: string;
  cacheControl?: string;
}

export interface StorageUploadResult {
  path: string;
  url: string;
}

/**
 * 存储适配器接口：业务代码只依赖此接口。
 * 当前实现为 Supabase Storage；未来切换国内 COS/OSS 时只需替换实现，
 * 无需修改任何业务页面。
 */
export interface StorageAdapter {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  getPublicUrl(bucket: string, path: string): string;
}
