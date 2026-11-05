import "server-only";

import type { NextRequest } from "next/server";

import type { UserProfile } from "@/lib/types";
import {
  createAuthSession,
  getAuthSessionContext,
  type AuthSessionContext
} from "@/src/server/db/auth";
import { ApiError } from "@/src/server/errors";
import { AUTH_COOKIE_NAME, AUTH_SESSION_DAYS, requireLocalAuthConfig } from "./config";
import { createSessionToken, verifySessionToken, type SessionTokenClaims } from "./crypto";

export type RequestAuthUser = {
  id: string;
  email: string;
  user_metadata: {
    role: UserProfile["role"];
    customer_name: string | null;
  };
};

export type RequestAuthContext = {
  token: string;
  claims: SessionTokenClaims;
  session: AuthSessionContext;
  user: RequestAuthUser;
  profile: UserProfile;
};

export function getRequestAuthToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const bearer = authorization.slice(7).trim();
    if (bearer) return bearer;
  }
  return request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function authenticateLocalRequest(request: NextRequest): Promise<RequestAuthContext> {
  const token = getRequestAuthToken(request);
  if (!token) throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");

  const { secret } = requireLocalAuthConfig();
  const claims = verifySessionToken(token, secret);
  if (!claims) throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");

  const session = await getAuthSessionContext(claims.sid);
  if (!session || session.user.id !== claims.sub) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  return {
    token,
    claims,
    session,
    profile: session.profile,
    user: {
      id: session.user.id,
      email: session.user.email,
      user_metadata: {
        role: session.profile.role,
        customer_name: session.profile.customer_name
      }
    }
  };
}

export async function startLocalSession(input: {
  userId: string;
  email: string;
  userAgent: string | null;
}): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const { secret } = requireLocalAuthConfig();
  const expiresAt = new Date(Date.now() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const sessionId = await createAuthSession({
    userId: input.userId,
    expiresAt,
    userAgent: input.userAgent?.slice(0, 500) ?? null
  });
  const token = createSessionToken({
    userId: input.userId,
    email: input.email,
    sessionId,
    expiresAt,
    secret
  });
  return { sessionId, token, expiresAt };
}
