import { supabase } from "@/src/api/client";

import type { StorageAdapter, StorageUploadInput } from "./types";

export const supabaseStorage: StorageAdapter = {
  async upload({ bucket, path, file, contentType, cacheControl = "3600" }: StorageUploadInput) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl,
      upsert: false,
      ...(contentType ? { contentType } : {})
    });
    if (error) throw error;
    return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
  },

  getPublicUrl(bucket: string, path: string) {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  async delete(bucket: string, path: string) {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  },

  async download(bucket: string, path: string) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) throw error ?? new Error("文件不存在");
    return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type || null };
  }
};
