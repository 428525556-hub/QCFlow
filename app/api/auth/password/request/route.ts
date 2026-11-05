import { normalizeEmail } from "@/lib/security";
import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { assertLocalAuthEnabled } from "@/src/server/auth/config";
import { generateOpaqueToken, hashToken } from "@/src/server/auth/crypto";
import { sendPasswordResetEmail } from "@/src/server/auth/email";
import {
  createPasswordResetToken,
  findAuthUserByEmail,
  hasRecentPasswordResetRequest
} from "@/src/server/db/auth";
import { pgError } from "@/src/server/db/pgErrors";
import { ApiError } from "@/src/server/errors";
import { logger } from "@/src/server/logger";

export const POST = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError("邮箱格式不正确", 400, "VALIDATION_ERROR");
  }

  try {
    const user = await findAuthUserByEmail(email);
    if (user && !user.disabled) {
      const recentlyRequested = await hasRecentPasswordResetRequest(user.id);
      if (!recentlyRequested) {
        const token = generateOpaqueToken();
        await createPasswordResetToken({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        });
        await sendPasswordResetEmail({ email: user.email, token }).catch((error) => {
          logger.warn("password_reset_email_failed", {
            code: error instanceof ApiError ? error.code : "EMAIL_SEND_FAILED"
          });
        });
      }
    }
  } catch (error) {
    throw pgError(error);
  }

  return apiSuccess({ accepted: true });
});
