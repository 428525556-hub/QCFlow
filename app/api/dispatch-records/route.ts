import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listDispatchRecords } from "@/src/server/db/shipments";
import { insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { DispatchRecord } from "@/lib/types";
import type { Database } from "@/src/types";

type DispatchInsert = Database["public"]["Tables"]["dispatch_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const orderId = request.nextUrl.searchParams.get("orderId");

  if (getDataBackend() === "pg") {
    return apiSuccess(await listDispatchRecords(orderId));
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("dispatch_records").select("*").order("created_at", { ascending: false });
  if (orderId) query = query.eq("order_id", orderId);

  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data ?? []);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as { record?: DispatchInsert };
  if (!body.record) throw new ApiError("record is required", 400, "VALIDATION_ERROR");

  const row = { ...body.record, user_id: user.id };

  if (getDataBackend() === "pg") {
    try {
      const inserted = await insertRows<DispatchRecord>("dispatch_records", [row], TABLE_COLUMNS.dispatch_records);
      return apiSuccess(inserted[0], 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("dispatch_records").insert(row).select("*").single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
