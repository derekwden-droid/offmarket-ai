import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { recordApiError } from "@/lib/observability";

/** Successful API envelope. */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

/** Error API envelope. */
export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

/** Build a JSON success response. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

/** Build a JSON error response. */
export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

/**
 * Map a thrown value to a consistent HTTP error response.
 *
 * - ZodError                          -> 422 VALIDATION_ERROR
 * - Prisma init / connection failure  -> 503 SERVICE_UNAVAILABLE
 * - Prisma P2002 (unique constraint)  -> 409 CONFLICT
 * - Prisma P2003 (FK constraint)      -> 409 CONFLICT
 * - Prisma P2025 (record not found)   -> 404 NOT_FOUND
 * - other known Prisma errors         -> 500 DATABASE_ERROR
 * - anything else                     -> 500 INTERNAL_ERROR
 *
 * Phase 6: 5xx outcomes (DATABASE_ERROR, INTERNAL_ERROR) are reported to the
 * observability sink (structured `api.error` log + Sentry) so they surface on
 * dashboards/alerts. 4xx outcomes are expected client errors and are not paged.
 */
export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    return fail(
      "VALIDATION_ERROR",
      "The request body failed validation.",
      422,
      error.flatten(),
    );
  }

  // The database could not be reached / the client could not initialize.
  // Treat this as a transient outage so callers can retry.
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return fail(
      "SERVICE_UNAVAILABLE",
      "The database is temporarily unavailable. Please retry shortly.",
      503,
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return fail(
          "CONFLICT",
          "A record with the same unique fields already exists.",
          409,
          { target: error.meta?.target },
        );
      case "P2003":
        return fail(
          "CONFLICT",
          "The operation violates a foreign-key constraint.",
          409,
          { field: error.meta?.field_name },
        );
      case "P2025":
        return fail("NOT_FOUND", "The requested record was not found.", 404);
      default:
        recordApiError(error, { code: `DATABASE_ERROR:${error.code}` });
        return fail("DATABASE_ERROR", `Database error (${error.code}).`, 500);
    }
  }

  recordApiError(error, { code: "INTERNAL_ERROR" });
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  return fail("INTERNAL_ERROR", message, 500);
}
