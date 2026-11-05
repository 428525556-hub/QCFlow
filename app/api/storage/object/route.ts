import { NextResponse } from "next/server";

import { getDataBackend } from "@/src/server/db/backend";
import { findOrderIdByStoragePath } from "@/src/server/db/storageAccess";
import { getOrderById } from "@/src/server/db/orders";
import { pgError } from "@/src/server/db/pgErrors";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError } from "@/src/server/errors";
import { getStorageAdapter, getStorageBackend } from "@/src/server/storage";
import { requireRequestProfile } from "@/src/server/supabaseServer";

const ALLOWED_BUCKETS = new Set(["inspection-photos", "order-attachments"]);

export const GET = withApiHandler(async (request) => {
  if (getStorageBackend() !== "cos") throw new ApiError("Not found", 404, "NOT_FOUND");
  if (getDataBackend() !== "pg") throw new ApiError("Private storage requires DATA_BACKEND=pg", 409, "CONFIG_CONFLICT");

  const { profile } = await requireRequestProfile(request);
  const bucket = request.nextUrl.searchParams.get("bucket") ?? "";
  const objectPath = request.nextUrl.searchParams.get("path") ?? "";
  if (!ALLOWED_BUCKETS.has(bucket) || !objectPath || objectPath.includes("..")) {
    throw new ApiError("Invalid storage object", 400, "VALIDATION_ERROR");
  }

  if (profile.role === "client" || profile.role === "field_inspector") {
    try {
      const orderId = await findOrderIdByStoragePath(objectPath);
      if (!orderId) throw new ApiError("Object not found", 404, "NOT_FOUND");
      const order = await getOrderById(orderId);
      if (!order) throw new ApiError("Object not found", 404, "NOT_FOUND");
      if (order.customer_name !== profile.customer_name) {
        throw new ApiError("Forbidden", 403, "FORBIDDEN");
      }
      if (profile.role === "field_inspector" && order.inspection_plan !== "field") {
        throw new ApiError("Forbidden", 403, "FORBIDDEN");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  try {
    const object = await getStorageAdapter().download(bucket, objectPath);
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw pgError(error);
  }
});
