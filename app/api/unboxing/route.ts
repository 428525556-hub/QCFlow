import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listUnboxingRecords } from "@/src/server/db/shipments";
import { insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { UnboxingRecord } from "@/lib/types";
import type { Database } from "@/src/types";

type UnboxingInsert = Database["public"]["Tables"]["unboxing_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const limitParam = Number(params.get("limit") ?? "");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), 1000) : undefined;

  if (getDataBackend() === "pg") {
    return apiSuccess(await listUnboxingRecords({ orderId, limit }));
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("unboxing_records").select("*").order("created_at", { ascending: false });
  if (orderId) query = query.eq("order_id", orderId);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data ?? []);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as { records?: UnboxingInsert[] };
  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length === 0) throw new ApiError("records is required", 400, "VALIDATION_ERROR");

  const rows = records.map((record) => ({ ...record, user_id: user.id }));

  if (getDataBackend() === "pg") {
    try {
      const inserted = await insertRows<UnboxingRecord>("unboxing_records", rows, TABLE_COLUMNS.unboxing_records);
      return apiSuccess(inserted, 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("unboxing_records").insert(rows).select("*");
  if (error) throw databaseError(error);
  return apiSuccess(data ?? [], 201);
});
