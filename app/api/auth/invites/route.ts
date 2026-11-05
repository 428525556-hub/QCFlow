import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { assertLocalAuthEnabled } from "@/src/server/auth/config";
import {
  formatInviteCode,
  generateInviteCode,
  hashInviteCode
} from "@/src/server/auth/crypto";
import { createRegistrationInvite } from "@/src/server/db/auth";
import { pgError } from "@/src/server/db/pgErrors";
import { listRegistrationInvites } from "@/src/server/db/profiles";
import { ApiError } from "@/src/server/errors";
import { requireAdminProfile } from "@/src/server/supabaseServer";

type InviteRole = "staff" | "client" | "field_inspector";

export const GET = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  await requireAdminProfile(request);
  return apiSuccess(await listRegistrationInvites());
});

export const POST = withApiHandler(async (request) => {
  assertLocalAuthEnabled();
  const { user, profile } = await requireAdminProfile(request);
  const body = (await request.json().catch(() => ({}))) as {
    role?: InviteRole;
    customer_name?: string | null;
    days?: number;
  };
  const role = body.role ?? "staff";
  if (!["staff", "client", "field_inspector"].includes(role)) {
    throw new ApiError("账号类型无效", 400, "VALIDATION_ERROR");
  }

  const customerName = body.customer_name?.trim() || null;
  if ((role === "client" || role === "field_inspector") && !customerName) {
    throw new ApiError("客户账号和出差检品账号必须填写客户名称", 400, "VALIDATION_ERROR");
  }

  const days = Math.min(90, Math.max(1, Number(body.days ?? 7) || 7));
  const code = generateInviteCode();
  try {
    const invite = await createRegistrationInvite({
      createdByUserId: user.id,
      createdByEmail: profile.email || user.email || "",
      codeHash: hashInviteCode(code),
      role,
      customerName,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    });
    return apiSuccess({ invite, code: formatInviteCode(code) }, 201);
  } catch (error) {
    throw pgError(error);
  }
});
