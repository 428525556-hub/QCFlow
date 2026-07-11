import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];
type Context = { params: { id: string } };

export const GET = withApiHandler<Context>(async (request, { params }) => {
  await requireRequestUser(request);
  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("orders").select("*").eq("id", params.id);
  if (request.nextUrl.searchParams.get("includeDeleted") !== "true") query = query.is("deleted_at", null);

  const { data, error } = await query.single();
  if (error) throw databaseError(error, error.code === "PGRST116" ? 404 : 400);
  return apiSuccess(data);
});

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  await requireRequestUser(request);
  const payload = (await request.json()) as OrderUpdate;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("orders").update(payload).eq("id", params.id).select("*").maybeSingle();

  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const DELETE = withApiHandler<Context>(async (request, { params }) => {
  await requireRequestUser(request);
  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.from("orders").delete().eq("id", params.id);

  if (error) throw databaseError(error);
  return apiSuccess({ id: params.id });
});

