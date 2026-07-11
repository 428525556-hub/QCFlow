import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const supabase = createRequestSupabaseClient(request);
  const params = request.nextUrl.searchParams;
  let query = supabase.from("orders").select("*");

  if (params.get("includeDeleted") !== "true") query = query.is("deleted_at", null);
  if (params.get("customerName")) query = query.eq("customer_name", params.get("customerName")!);

  const { data, error } = await query.order("shipping_date", { ascending: true, nullsFirst: false });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const user = await requireRequestUser(request);
  const payload = (await request.json()) as OrderInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("orders")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

