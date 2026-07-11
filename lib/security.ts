export const ADMIN_EMAIL = "shuoyuqc@163.com";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAdminEmail(email?: string | null) {
  return normalizeEmail(email ?? "") === ADMIN_EMAIL;
}

export function createInviteCode(length = 18) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

export async function hashInviteCode(code: string) {
  const normalized = code.trim().toUpperCase().replaceAll("-", "");
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatInviteCode(code: string) {
  return code.match(/.{1,6}/g)?.join("-") ?? code;
}
