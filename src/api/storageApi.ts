import { STORAGE_BUCKETS } from "@/src/constants";
import { getCurrentUser } from "@/src/api/userApi";
import { uploadToStorage } from "@/src/api/uploadApi";
import { compressImageFile } from "@/src/utils";

export async function uploadCompressedImage(file: File, folder: string) {
  const { data: session } = await getCurrentUser();
  const userId = session.user?.id;
  if (!userId) throw new Error("登录已失效，请重新登录。");

  const compressed = await compressImageFile(file, { maxSide: 1280, quality: 0.68 });
  const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const result = await uploadToStorage(STORAGE_BUCKETS.inspectionPhotos, path, compressed);
  return { path: result.path, url: result.url, size: compressed.size };
}
