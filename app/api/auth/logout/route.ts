import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import {
  AUTH_COOKIE_NAME,
  assertLocalAuthEnabled,
  authCookieOptions,
  requireLocalAuthConfig
} from "@/src/server/auth/config";
import { verifySessionToken } from "@/src/server/auth/crypto";
import { getRequestAuthToken } from "@/src/server/auth/session";
import { revokeAuthSession } from "@/src/server/db/auth";
import { pgError } from "@/src/server/db/pgErrors";
import { ApiError } from "@/src/server/errors";

export const POST = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  const token = getRequestAuthToken(request);

  if (token) {
    try {
      const { secret } = requireLocalAuthConfig();
      const claims = verifySessionToken(token, secret);
      if (claims) await revokeAuthSession(claims.sid);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "AUTH_NOT_CONFIGURED") throw pgError(error);
    }
  }

  const response = apiSuccess({ loggedOut: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", { ...authCookieOptions(), maxAge: 0 });
  return response;
});
