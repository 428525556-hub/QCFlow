import { supabase } from "@/src/api/client";
import { STORAGE_BUCKETS } from "@/src/constants";
import { getCurrentUser } from "@/src/api/userApi";
import { compressImageFile } from "@/src/utils";

export async function uploadCompressedImage(file: File, folder: string) {
  const { data: session } = await getCurrentUser();
  const userId = session.user?.id;
  if (!userId) throw new Error("登录已失效，请重新登录。");

  const compressed = await compressImageFile(file, { maxSide: 1280, quality: 0.68 });
  const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).upload(path, compressed, {
    cacheControl: "3600",
    upsert: false,
    contentType: compressed.type
  });
  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).getPublicUrl(path);
  return { path, url: data.publicUrl, size: compressed.size };
}
