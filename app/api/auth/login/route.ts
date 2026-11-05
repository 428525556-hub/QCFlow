import { normalizeEmail } from "@/lib/security";
import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import {
  AUTH_COOKIE_NAME,
  assertLocalAuthEnabled,
  authCookieOptions,
  requireLocalAuthConfig
} from "@/src/server/auth/config";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/src/server/auth/crypto";
import { startLocalSession } from "@/src/server/auth/session";
import {
  clearLoginFailures,
  findAuthUserByEmail,
  recordLoginFailure
} from "@/src/server/db/auth";
import { getUserProfileById } from "@/src/server/db/profiles";
import { pgError } from "@/src/server/db/pgErrors";
import { ApiError } from "@/src/server/errors";

export const POST = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  requireLocalAuthConfig();

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  if (!email || !password || email.length > 254 || password.length > 128) {
    throw new ApiError("邮箱和密码不能为空", 400, "VALIDATION_ERROR");
  }

  try {
    const user = await findAuthUserByEmail(email);
    const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (
      !user ||
      user.disabled ||
      !user.email_verified_at ||
      (user.locked_until && new Date(user.locked_until).getTime() > Date.now())
    ) {
      throw new ApiError("邮箱或密码不正确", 401, "INVALID_CREDENTIALS");
    }

    if (!valid) {
      await recordLoginFailure(user.id).catch(() => undefined);
      throw new ApiError("邮箱或密码不正确", 401, "INVALID_CREDENTIALS");
    }

    const profile = await getUserProfileById(user.id);
    if (!profile) throw new ApiError("账号资料不完整，请联系管理员", 403, "PROFILE_MISSING");

    await clearLoginFailures(user.id);
    const session = await startLocalSession({
      userId: user.id,
      email: user.email,
      userAgent: request.headers.get("user-agent")
    });

    const response = apiSuccess({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: {
          role: profile.role,
          customer_name: profile.customer_name
        }
      },
      profile
    });
    response.cookies.set(AUTH_COOKIE_NAME, session.token, authCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw pgError(error);
  }
});
