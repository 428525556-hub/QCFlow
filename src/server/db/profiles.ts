import type { RegistrationInvite, UserProfile } from "@/lib/types";

import { selectAll } from "./read.ts";

export async function getUserProfileById(id: string): Promise<UserProfile | null> {
  const rows = await selectAll<UserProfile>("user_profiles", {
    conditions: ["id = $1"],
    values: [id],
    limit: 1
  });
  return rows[0] ?? null;
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  return selectAll<UserProfile>("user_profiles", { orderBy: "created_at asc" });
}

export async function listRegistrationInvites(): Promise<RegistrationInvite[]> {
  return selectAll<RegistrationInvite>("registration_invites", { orderBy: "created_at desc" });
}

export async function findActiveInvite(codeHash: string, nowIso: string): Promise<RegistrationInvite | null> {
  const rows = await selectAll<RegistrationInvite>("registration_invites", {
    conditions: ["code_hash = $1", "active = true", "used_at is null", "expires_at > $2"],
    values: [codeHash, nowIso],
    limit: 1
  });
  return rows[0] ?? null;
}
