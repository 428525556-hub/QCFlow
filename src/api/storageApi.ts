import { storage } from "@/src/server/storage";
import { STORAGE_BUCKETS } from "@/src/constants";
import { getCurrentUser } from "@/src/api/userApi";
import { compressImageFile } from "@/src/utils";

export async function uploadCompressedImage(file: File, folder: string) {
  const { data: session } = await getCurrentUser();
  const userId = session.user?.id;
  if (!userId) throw new Error("登录已失效，请重新登录。");

  const compressed = await compressImageFile(file, { maxSide: 1280, quality: 0.68 });
  const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const result = await storage.upload({
    bucket: STORAGE_BUCKETS.inspectionPhotos,
    path,
    file: compressed,
    contentType: compressed.type
  });
  return { path: result.path, url: result.url, size: compressed.size };
}
