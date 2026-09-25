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
  }
};
