type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type AuthBackend = "supabase" | "local";
export type StorageBackend = "supabase" | "cos";

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const publicEnv: PublicEnv = {
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
};

export const publicAuthBackend: AuthBackend =
  process.env.NEXT_PUBLIC_AUTH_BACKEND === "local" ? "local" : "supabase";

export const publicStorageBackend: StorageBackend =
  process.env.NEXT_PUBLIC_STORAGE_BACKEND === "cos" ? "cos" : "supabase";

export const publicCosUrls = {
  "inspection-photos": process.env.NEXT_PUBLIC_COS_INSPECTION_PHOTOS_BASE_URL?.replace(/\/+$/, "") ?? "",
  "order-attachments": process.env.NEXT_PUBLIC_COS_ORDER_ATTACHMENTS_BASE_URL?.replace(/\/+$/, "") ?? ""
} as const;

