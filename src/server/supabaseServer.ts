import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { publicEnv } from "@/src/config/env";
import { ApiError } from "@/src/server/errors";
import type { Database } from "@/src/types";

export function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

export function createRequestSupabaseClient(request: NextRequest) {
  const token = getBearerToken(request);

  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: token
      ? {
          headers: { Authorization: `Bearer ${token}` }
        }
      : undefined
  });
}

export async function requireRequestUser(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  return data.user;
}
