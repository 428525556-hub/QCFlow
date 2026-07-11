import { supabase } from "@/src/api/client";
import type { Database } from "@/src/types";

type RegistrationInviteInsert = Database["public"]["Tables"]["registration_invites"]["Insert"];
type RegistrationInviteUpdate = Database["public"]["Tables"]["registration_invites"]["Update"];
type UserProfileInsert = Database["public"]["Tables"]["user_profiles"]["Insert"];

export async function getCurrentUser() {
  return supabase.auth.getUser();
}

export function onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithProfile(email: string, password: string, metadata: { role: string; customer_name: string | null }) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  });
}

export async function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({ type: "signup", email });
}

export async function getUserProfile(userId: string) {
  return supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle();
}

export async function upsertUserProfile(profile: UserProfileInsert) {
  return supabase.from("user_profiles").upsert(profile);
}

export async function getRegistrationInvites() {
  return supabase.from("registration_invites").select("*").order("created_at", { ascending: false });
}

export async function insertRegistrationInvite(invite: RegistrationInviteInsert) {
  return supabase.from("registration_invites").insert(invite);
}

export async function getValidRegistrationInvite(codeHash: string, nowIso: string) {
  return supabase.from("registration_invites").select("*").eq("code_hash", codeHash).eq("active", true).is("used_at", null).gt("expires_at", nowIso).limit(1).maybeSingle();
}

export async function updateRegistrationInvite(inviteId: string, payload: RegistrationInviteUpdate) {
  return supabase.from("registration_invites").update(payload).eq("id", inviteId);
}
