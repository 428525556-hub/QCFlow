import { createInviteCode, hashInviteCode, normalizeEmail } from "@/lib/security";
import { publicAuthBackend } from "@/src/config/env";
import type { RegistrationInvite, UserProfile, UserRole } from "@/lib/types";
import { supabase } from "@/src/api/client";
import type { Database } from "@/src/types";

type RegistrationInviteInsert = Database["public"]["Tables"]["registration_invites"]["Insert"];
type RegistrationInviteUpdate = Database["public"]["Tables"]["registration_invites"]["Update"];
type UserProfileInsert = Database["public"]["Tables"]["user_profiles"]["Insert"];

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: {
    role?: UserRole;
    customer_name?: string | null;
    [key: string]: unknown;
  };
};

type AuthError = { message: string; code?: string; details?: string };
type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthError };

type ApiEnvelope<T> = {
  data: T | null;
  error: AuthError | null;
  requestId?: string;
};

const AUTH_EVENT = "qcflow-auth-change";

export function isLocalAuthBackend() {
  return publicAuthBackend === "local";
}

function emitAuthChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}

async function localRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      }
    });
    return (await response.json()) as ApiEnvelope<T>;
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "网络请求失败" }
    };
  }
}

export async function getCurrentUser(): Promise<{
  data: { user: AuthUser | null };
  error: AuthError | null;
}> {
  if (!isLocalAuthBackend()) {
    const result = await supabase.auth.getUser();
    return {
      data: { user: result.data.user as AuthUser | null },
      error: result.error as AuthError | null
    };
  }

  const result = await localRequest<{ user: AuthUser; profile: UserProfile }>("/api/auth/session");
  if (result.data) return { data: { user: result.data.user }, error: null };
  if (result.error?.code === "UNAUTHORIZED" || result.error?.message === "Unauthorized") {
    return { data: { user: null }, error: null };
  }
  return { data: { user: null }, error: result.error ?? { message: "读取登录状态失败" } };
}

export function onAuthStateChange(callback: (event: string, user: AuthUser | null) => void) {
  if (!isLocalAuthBackend()) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user as AuthUser | null);
    });
  }

  const listener = async () => {
    const result = await getCurrentUser();
    callback("TOKEN_REFRESHED", result.data?.user ?? null);
  };
  if (typeof window !== "undefined") window.addEventListener(AUTH_EVENT, listener);

  return {
    data: {
      subscription: {
        unsubscribe() {
          if (typeof window !== "undefined") window.removeEventListener(AUTH_EVENT, listener);
        }
      }
    }
  };
}

export async function signOut() {
  if (isLocalAuthBackend()) {
    const result = await localRequest<{ loggedOut: boolean }>("/api/auth/logout", {
      method: "POST",
      body: "{}"
    });
    emitAuthChange();
    return { error: result.error };
  }
  const result = await supabase.auth.signOut();
  return { error: result.error as AuthError | null };
}

export async function signInWithPassword(email: string, password: string) {
  if (isLocalAuthBackend()) {
    const result = await localRequest<{ user: AuthUser; profile: UserProfile }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalizeEmail(email), password })
    });
    if (result.data) emitAuthChange();
    return result;
  }

  const result = await supabase.auth.signInWithPassword({ email, password });
  return { data: result.data, error: result.error as AuthError | null };
}

export async function registerWithInvite(email: string, password: string, inviteCode: string) {
  const normalizedEmail = normalizeEmail(email);
  if (isLocalAuthBackend()) {
    const result = await localRequest<{ user: AuthUser; profile: UserProfile }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: normalizedEmail, password, inviteCode })
    });
    if (result.data) emitAuthChange();
    return result;
  }

  const codeHash = await hashInviteCode(inviteCode);
  const inviteResult = await supabase
    .from("registration_invites")
    .select("*")
    .eq("code_hash", codeHash)
    .eq("active", true)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (inviteResult.error) return { data: null, error: inviteResult.error as AuthError };
  if (!inviteResult.data) {
    return {
      data: null,
      error: { message: "邀请码无效、已过期或已被使用", code: "INVALID_INVITE" }
    };
  }

  const invite = inviteResult.data as RegistrationInvite;
  const signUpResult = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { role: invite.role, customer_name: invite.customer_name }
    }
  });
  if (signUpResult.error || !signUpResult.data.user) {
    return {
      data: null,
      error: (signUpResult.error as AuthError | null) ?? { message: "创建账号失败" }
    };
  }

  await supabase
    .from("registration_invites")
    .update({
      used_at: new Date().toISOString(),
      used_by_email: normalizedEmail,
      used_by_user_id: signUpResult.data.user.id
    })
    .eq("id", invite.id);
  await supabase.from("user_profiles").upsert({
    id: signUpResult.data.user.id,
    email: normalizedEmail,
    role: invite.role,
    customer_name: invite.customer_name
  });

  return {
    data: {
      user: signUpResult.data.user as AuthUser,
      profile: {
        id: signUpResult.data.user.id,
        created_at: new Date().toISOString(),
        email: normalizedEmail,
        role: invite.role,
        customer_name: invite.customer_name
      } as UserProfile
    },
    error: null
  };
}

export async function resendSignupConfirmation(email: string) {
  if (isLocalAuthBackend()) {
    return { error: { message: "本地认证不需要邮箱确认" } as AuthError };
  }
  const result = await supabase.auth.resend({ type: "signup", email });
  return { error: result.error as AuthError | null };
}

export async function getUserProfile(userId: string) {
  if (isLocalAuthBackend()) {
    const result = await localRequest<{ user: AuthUser; profile: UserProfile }>("/api/auth/session");
    if (result.data?.profile.id === userId) return { data: result.data.profile, error: null };
    return {
      data: null,
      error: result.error ?? { message: "账号资料与当前会话不一致", code: "PROFILE_MISMATCH" }
    };
  }
  return supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle();
}

export async function upsertUserProfile(profile: UserProfileInsert) {
  if (isLocalAuthBackend()) {
    return {
      data: null,
      error: { message: "本地认证模式下不能由客户端直接修改账号资料" } as AuthError
    };
  }
  return supabase.from("user_profiles").upsert(profile);
}

export async function getRegistrationInvites() {
  if (isLocalAuthBackend()) {
    return localRequest<RegistrationInvite[]>("/api/auth/invites");
  }
  return supabase.from("registration_invites").select("*").order("created_at", { ascending: false });
}

export async function createRegistrationInvite(input: {
  role: "staff" | "client" | "field_inspector";
  customer_name: string | null;
  days: number;
}) {
  if (isLocalAuthBackend()) {
    return localRequest<{ invite: RegistrationInvite; code: string }>("/api/auth/invites", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (!user) return { data: null, error: { message: "登录已失效" } as AuthError };

  const code = createInviteCode();
  const codeHash = await hashInviteCode(code);
  const expiresAt = new Date(Date.now() + Math.max(1, input.days) * 24 * 60 * 60 * 1000).toISOString();
  const insertResult = await supabase
    .from("registration_invites")
    .insert({
      created_by_user_id: user.id,
      created_by_email: user.email ?? "",
      code_hash: codeHash,
      role: input.role,
      customer_name: input.customer_name,
      expires_at: expiresAt
    })
    .select("*")
    .single();
  if (insertResult.error) return { data: null, error: insertResult.error as AuthError };
  const formatted = code.match(/.{1,6}/g)?.join("-") ?? code;
  return {
    data: { invite: insertResult.data as RegistrationInvite, code: formatted },
    error: null
  };
}

export async function insertRegistrationInvite(invite: RegistrationInviteInsert) {
  if (isLocalAuthBackend()) {
    return { data: null, error: { message: "请使用 createRegistrationInvite" } as AuthError };
  }
  return supabase.from("registration_invites").insert(invite);
}

export async function getValidRegistrationInvite(codeHash: string, nowIso: string) {
  if (isLocalAuthBackend()) {
    return { data: null, error: { message: "邀请码由服务端校验" } as AuthError };
  }
  return supabase
    .from("registration_invites")
    .select("*")
    .eq("code_hash", codeHash)
    .eq("active", true)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .limit(1)
    .maybeSingle();
}

export async function updateRegistrationInvite(inviteId: string, payload: RegistrationInviteUpdate) {
  if (isLocalAuthBackend()) {
    if (payload.active !== false) {
      return { data: null, error: { message: "本地认证只支持停用邀请码" } as AuthError };
    }
    return localRequest<{ id: string; active: false }>(`/api/auth/invites/${inviteId}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false })
    });
  }
  return supabase.from("registration_invites").update(payload).eq("id", inviteId);
}

export async function requestPasswordReset(email: string) {
  if (!isLocalAuthBackend()) {
    const result = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
    return { data: result.error ? null : { accepted: true }, error: result.error as AuthError | null };
  }
  return localRequest<{ accepted: true }>("/api/auth/password/request", {
    method: "POST",
    body: JSON.stringify({ email: normalizeEmail(email) })
  });
}

export async function resetPassword(token: string, password: string) {
  if (!isLocalAuthBackend()) {
    return { data: null, error: { message: "当前仍使用 Supabase 认证" } as AuthError };
  }
  return localRequest<{ reset: true }>("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}
