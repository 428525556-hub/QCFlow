import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { publicEnv } from "@/src/config/env";
import { ApiError } from "@/src/server/errors";
import type { Database, UserProfile } from "@/src/types";

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

export async function requireRequestProfile(request: NextRequest) {
  const user = await requireRequestUser(request);
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle();

  if (error) throw new ApiError(error.message, 400, error.code ?? "PROFILE_ERROR", error.details);
  if (data) return { user, profile: data as UserProfile };

  const role = user.email === "shuoyuqc@163.com" ? "admin" : user.user_metadata?.role === "client" ? "client" : user.user_metadata?.role === "field_inspector" ? "field_inspector" : "staff";
  return {
    user,
    profile: {
      id: user.id,
      created_at: new Date().toISOString(),
      email: user.email ?? "",
      role,
      customer_name: role === "client" || role === "field_inspector" ? String(user.user_metadata?.customer_name ?? "") || null : null
    } as UserProfile
  };
}
