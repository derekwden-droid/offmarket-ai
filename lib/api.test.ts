import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { ok, fail, handleRouteError } from "@/lib/api";

/** Parse a route-handler response body into the envelope shape. */
async function bodyOf(res: Response): Promise<{
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}> {
  return (await res.json()) as {
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string; details?: unknown };
  };
}

function knownRequestError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: "6.2.1",
    meta,
  });
}

describe("ok()", () => {
  it("wraps data in a success envelope with status 200", async () => {
    const res = ok({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("honors a custom status code", () => {
    expect(ok({ created: true }, { status: 201 }).status).toBe(201);
  });
});

describe("fail()", () => {
  it("builds an error envelope with the given code, message, and status", async () => {
    const res = fail("TEAPOT", "I am a teapot", 418, { rfc: 2324 });
    expect(res.status).toBe(418);
    const body = await bodyOf(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({
      code: "TEAPOT",
      message: "I am a teapot",
      details: { rfc: 2324 },
    });
  });
});

describe("handleRouteError() — error mapping", () => {
  it("maps ZodError -> 422 VALIDATION_ERROR", async () => {
    let zodError: ZodError | undefined;
    try {
      z.object({ name: z.string() }).parse({});
    } catch (error) {
      zodError = error as ZodError;
    }
    const res = handleRouteError(zodError);
    expect(res.status).toBe(422);
    expect((await bodyOf(res)).error?.code).toBe("VALIDATION_ERROR");
  });

  it("maps a Prisma initialization failure -> 503 SERVICE_UNAVAILABLE", async () => {
    const error = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      "6.2.1",
    );
    const res = handleRouteError(error);
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).error?.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("maps P2002 (unique constraint) -> 409 CONFLICT", async () => {
    const res = handleRouteError(knownRequestError("P2002", { target: ["email"] }));
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error?.code).toBe("CONFLICT");
    expect(body.error?.details).toEqual({ target: ["email"] });
  });

  it("maps P2003 (foreign-key constraint) -> 409 CONFLICT", async () => {
    const res = handleRouteError(
      knownRequestError("P2003", { field_name: "propertyId" }),
    );
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error?.code).toBe("CONFLICT");
  });

  it("maps P2025 (record not found) -> 404 NOT_FOUND", async () => {
    const res = handleRouteError(knownRequestError("P2025"));
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).error?.code).toBe("NOT_FOUND");
  });

  it("maps other known Prisma errors -> 500 DATABASE_ERROR", async () => {
    const res = handleRouteError(knownRequestError("P2010"));
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error?.code).toBe("DATABASE_ERROR");
  });

  it("maps unknown errors -> 500 INTERNAL_ERROR", async () => {
    const res = handleRouteError(new Error("boom"));
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.error?.code).toBe("INTERNAL_ERROR");
    expect(body.error?.message).toBe("boom");
  });
});
