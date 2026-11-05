import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import {
  AUTH_COOKIE_NAME,
  assertLocalAuthEnabled,
  authCookieOptions
} from "@/src/server/auth/config";
import { hashPassword, hashToken } from "@/src/server/auth/crypto";
import { resetPasswordWithToken } from "@/src/server/db/auth";
import { pgError } from "@/src/server/db/pgErrors";
import { ApiError } from "@/src/server/errors";

export const POST = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const token = body.token?.trim() ?? "";
  const password = body.password ?? "";
  if (!token || token.length > 256) {
    throw new ApiError("重置链接无效或已过期", 400, "INVALID_RESET_TOKEN");
  }
  if (password.length < 8 || password.length > 128) {
    throw new ApiError("密码长度必须为 8–128 位", 400, "VALIDATION_ERROR");
  }

  try {
    const reset = await resetPasswordWithToken({
      tokenHash: hashToken(token),
      passwordHash: await hashPassword(password)
    });
    if (!reset) throw new ApiError("重置链接无效或已过期", 400, "INVALID_RESET_TOKEN");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw pgError(error);
  }

  const response = apiSuccess({ reset: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", { ...authCookieOptions(), maxAge: 0 });
  return response;
});
