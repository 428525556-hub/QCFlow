import { getStorageBackend } from "./config";
import { cosStorage } from "./cosStorage";
import { supabaseStorage } from "./supabaseStorage";

export function getStorageAdapter() {
  return getStorageBackend() === "cos" ? cosStorage : supabaseStorage;
}

export { getStorageBackend } from "./config";
export type { StorageAdapter, StorageUploadInput, StorageUploadResult } from "./types";
