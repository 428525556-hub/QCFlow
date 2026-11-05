type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type AuthBackend = "supabase" | "local";

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

