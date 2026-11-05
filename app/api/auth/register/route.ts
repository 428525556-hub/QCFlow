import { ADMIN_EMAIL, normalizeEmail } from "@/lib/security";
import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import {
  AUTH_COOKIE_NAME,
  assertLocalAuthEnabled,
  authCookieOptions,
  requireLocalAuthConfig
} from "@/src/server/auth/config";
import { hashInviteCode, hashPassword } from "@/src/server/auth/crypto";
import { startLocalSession } from "@/src/server/auth/session";
import { registerUserWithInvite } from "@/src/server/db/auth";
import { pgError } from "@/src/server/db/pgErrors";
import { findActiveInvite } from "@/src/server/db/profiles";
import { ApiError } from "@/src/server/errors";

export const POST = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  requireLocalAuthConfig();

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    inviteCode?: string;
  };
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  const inviteCode = body.inviteCode?.trim() ?? "";

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError("邮箱格式不正确", 400, "VALIDATION_ERROR");
  }
  if (!inviteCode || inviteCode.length > 128) {
    throw new ApiError("邮箱和邀请码不能为空", 400, "VALIDATION_ERROR");
  }
  if (password.length < 8 || password.length > 128) {
    throw new ApiError("密码长度必须为 8–128 位", 400, "VALIDATION_ERROR");
  }

  try {
    const codeHash = hashInviteCode(inviteCode);
    const invite = await findActiveInvite(codeHash, new Date().toISOString());
    if (!invite) throw new ApiError("邀请码无效、已过期或已被使用", 400, "INVALID_INVITE");

    const context = await registerUserWithInvite({
      email,
      passwordHash: await hashPassword(password),
      inviteCodeHash: codeHash,
      adminEmail: ADMIN_EMAIL
    });
    const session = await startLocalSession({
      userId: context.user.id,
      email,
      userAgent: request.headers.get("user-agent")
    });

    const response = apiSuccess(
      {
        user: {
          id: context.user.id,
          email,
          user_metadata: {
            role: context.profile.role,
            customer_name: context.profile.customer_name
          }
        },
        profile: context.profile
      },
      201
    );
    response.cookies.set(AUTH_COOKIE_NAME, session.token, authCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.message === "INVALID_INVITE") {
      throw new ApiError("邀请码无效、已过期或已被使用", 400, "INVALID_INVITE");
    }
    throw pgError(error);
  }
});
