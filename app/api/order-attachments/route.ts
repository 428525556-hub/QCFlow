import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listOrderAttachments } from "@/src/server/db/attachments";
import { insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { OrderAttachment } from "@/lib/types";
import type { Database } from "@/src/types";

type AttachmentInsert = Database["public"]["Tables"]["order_attachments"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (!orderId) throw new ApiError("orderId is required", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    return apiSuccess(await listOrderAttachments(orderId));
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("order_attachments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw databaseError(error);
  return apiSuccess(data ?? []);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as { attachments?: AttachmentInsert[] };
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (attachments.length === 0) throw new ApiError("attachments is required", 400, "VALIDATION_ERROR");

  const rows = attachments.map((attachment) => ({ ...attachment, user_id: user.id }));

  if (getDataBackend() === "pg") {
    try {
      const inserted = await insertRows<OrderAttachment>(
        "order_attachments",
        rows,
        TABLE_COLUMNS.order_attachments
      );
      return apiSuccess(inserted, 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("order_attachments").insert(rows).select("*");
  if (error) throw databaseError(error);
  return apiSuccess(data ?? [], 201);
});
