import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { assertLocalAuthEnabled } from "@/src/server/auth/config";
import { requireRequestProfile } from "@/src/server/supabaseServer";

export const GET = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  const { user, profile } = await requireRequestProfile(request);
  return apiSuccess({ user, profile });
});
