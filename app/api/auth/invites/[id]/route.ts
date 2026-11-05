import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { assertLocalAuthEnabled } from "@/src/server/auth/config";
import { revokeRegistrationInvite } from "@/src/server/db/auth";
import { pgError } from "@/src/server/db/pgErrors";
import { ApiError } from "@/src/server/errors";
import { requireAdminProfile } from "@/src/server/supabaseServer";

type Context = { params: { id: string } };

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  assertLocalAuthEnabled();
  await requireAdminProfile(request);
  const body = (await request.json().catch(() => ({}))) as { active?: boolean };
  if (body.active !== false) throw new ApiError("只支持停用邀请码", 400, "VALIDATION_ERROR");

  try {
    const revoked = await revokeRegistrationInvite(params.id);
    if (!revoked) throw new ApiError("邀请码不存在或已停用", 404, "NOT_FOUND");
    return apiSuccess({ id: params.id, active: false });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw pgError(error);
  }
});
