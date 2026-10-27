import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { listShipmentBatches, upsertShipmentBatch } from "@/src/server/db/shipments";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  if (getDataBackend() === "pg") {
    return apiSuccess(await listShipmentBatches());
  }
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("shipment_batches").select("*").order("shipping_date", { ascending: true });
  if (error) throw databaseError(error);
  return apiSuccess(data ?? []);
});

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json()) as { customer_name?: string; shipping_date?: string; batch_no?: string | null; remark?: string | null };

  const customerName = body.customer_name?.trim();
  const shippingDate = body.shipping_date;
  if (!customerName) throw new ApiError("客户不能为空", 400, "VALIDATION_ERROR");
  if (!shippingDate || !DATE_PATTERN.test(shippingDate)) throw new ApiError("出货日期格式不正确", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    try {
      const batch = await upsertShipmentBatch({
        customerName,
        shippingDate,
        batchNo: body.batch_no?.trim() || null,
        remark: body.remark?.trim() || null
      });
      return apiSuccess(batch, 200);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("shipment_batches")
    .upsert(
      {
        customer_name: customerName,
        shipping_date: shippingDate,
        batch_no: body.batch_no?.trim() || null,
        remark: body.remark?.trim() || null
      },
      { onConflict: "customer_name,shipping_date" }
    )
    .select("*")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 200);
});
