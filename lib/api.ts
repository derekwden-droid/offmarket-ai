import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

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
 *  - ZodError                          -> 422 VALIDATION_ERROR
 *  - Prisma P2002 (unique constraint)  -> 409 CONFLICT
 *  - Prisma P2025 (record not found)   -> 404 NOT_FOUND
 *  - anything else                     -> 500 INTERNAL_ERROR
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

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail(
        "CONFLICT",
        "A record with the same unique fields already exists.",
        409,
        { target: error.meta?.target },
      );
    }
    if (error.code === "P2025") {
      return fail("NOT_FOUND", "The requested record was not found.", 404);
    }
    return fail("DATABASE_ERROR", `Database error (${error.code}).`, 500);
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  return fail("INTERNAL_ERROR", message, 500);
}
