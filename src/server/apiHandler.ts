import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { apiFailure } from "@/src/server/apiResponse";
import { normalizeError } from "@/src/server/errors";
import { logger } from "@/src/server/logger";

type Handler<TContext> = (request: NextRequest, context: TContext, requestId: string) => Promise<NextResponse>;

async function attachRequestId(response: NextResponse, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  const body = (await response.json()) as Record<string, unknown>;
  return NextResponse.json({ ...body, requestId }, { status: response.status, headers });
}

export function withApiHandler<TContext = Record<string, never>>(handler: Handler<TContext>) {
  return async (request: NextRequest, context: TContext) => {
    const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
    const startedAt = Date.now();

    try {
      const response = await handler(request, context, requestId);
      logger.info("api_request", {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        status: response.status,
        durationMs: Date.now() - startedAt
      });
      return attachRequestId(response, requestId);
    } catch (error) {
      const normalized = normalizeError(error);
      logger.error("api_request_failed", {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        status: normalized.status,
        code: normalized.code,
        durationMs: Date.now() - startedAt
      });
      const response = apiFailure(normalized, normalized.status);
      return attachRequestId(response, requestId);
    }
  };
}
