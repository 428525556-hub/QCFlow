import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$DlJjTJmgBfj-mrHjKZJEaw$HCXWBth7jM3n7YSPNIIhAPE-biEIe6irUpoQsRGqWOeZ_RQMusOyZBb7PPXVh0Jq1inreolYuh7m62Qu0W3qoQ";
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, hashText] = stored.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !hashText) return false;

  const expected = Buffer.from(hashText, "base64url");
  const derived = (await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  })) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashInviteCode(code: string): string {
  const normalized = code.trim().toUpperCase().replaceAll("-", "");
  return hashToken(normalized);
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateInviteCode(length = 18): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

export function formatInviteCode(code: string): string {
  return code.match(/.{1,6}/g)?.join("-") ?? code;
}

export type SessionTokenClaims = {
  sub: string;
  email: string;
  sid: string;
  iat: number;
  exp: number;
};

export function createSessionToken(input: {
  userId: string;
  email: string;
  sessionId: string;
  expiresAt: Date;
  secret: string;
}): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(
    JSON.stringify({
      sub: input.userId,
      email: input.email,
      sid: input.sessionId,
      iat: now,
      exp: Math.floor(input.expiresAt.getTime() / 1000)
    })
  );
  const signature = createHmac("sha256", input.secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerText, payloadText, signatureText] = parts;

  const expected = createHmac("sha256", secret).update(`${headerText}.${payloadText}`).digest();
  const actual = Buffer.from(signatureText, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const header = JSON.parse(Buffer.from(headerText, "base64url").toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const payload = JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8")) as Partial<SessionTokenClaims>;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as SessionTokenClaims;
  } catch {
    return null;
  }
}
