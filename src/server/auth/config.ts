import "server-only";

import type { AuthBackend } from "@/src/config/env";
import { ApiError } from "@/src/server/errors";

export const AUTH_COOKIE_NAME = "qcflow_session";
export const AUTH_SESSION_DAYS = 7;

export function getAuthBackend(): AuthBackend {
  return process.env.AUTH_BACKEND === "local" ? "local" : "supabase";
}

export function assertLocalAuthEnabled(): void {
  if (getAuthBackend() !== "local") {
    throw new ApiError("Not found", 404, "NOT_FOUND");
  }
}

export function requireLocalAuthConfig() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ApiError("JWT_SECRET 未配置或长度不足 32 位", 503, "AUTH_NOT_CONFIGURED");
  }
  return { secret };
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.AUTH_COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: AUTH_SESSION_DAYS * 24 * 60 * 60
  };
}
