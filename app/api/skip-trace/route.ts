import type { NextRequest } from "next/server";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleRouteError } from "@/lib/api";
import { skipTraceRequestSchema } from "@/lib/validations";
import { skipTrace } from "@/lib/providers/skip-trace";
import { mapWithConcurrency } from "@/lib/concurrency";

// Prisma + provider calls require the Node.js runtime.
export const runtime = "nodejs";

type ItemStatus = "matched" | "no_match" | "error";

interface SkipTraceItemResult {
  id: string;
  status: ItemStatus;
  ownerName?: string;
  confidence?: number;
  reason?: string;
  message?: string;
}

/**
 * POST /api/skip-trace
 * Resolve owner contact details for the given property ids using bounded
 * concurrency. Each property transitions to SKIP_TRACED whether or not a match
 * is found; matched properties are updated with owner contact fields. Per-item
 * failures are captured and returned rather than aborting the whole batch.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { propertyIds, concurrency } = skipTraceRequestSchema.parse(body);

    const properties = await prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zip: true,
      },
    });

    if (properties.length === 0) {
      return fail(
        "NOT_FOUND",
        "None of the supplied property ids were found.",
        404,
      );
    }

    const limit = concurrency ?? 5;

    const results = await mapWithConcurrency<
      (typeof properties)[number],
      SkipTraceItemResult
    >(properties, limit, async (property) => {
      try {
        const trace = await skipTrace({
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
        });

        if (trace.matched) {
          await prisma.property.update({
            where: { id: property.id },
            data: {
              ownerName: trace.ownerName,
              ownerPhone: trace.ownerPhone,
              ownerEmail: trace.ownerEmail,
              status: LeadStatus.SKIP_TRACED,
            },
          });
          return {
            id: property.id,
            status: "matched",
            ownerName: trace.ownerName,
            confidence: trace.confidence,
          };
        }

        await prisma.property.update({
          where: { id: property.id },
          data: { status: LeadStatus.SKIP_TRACED },
        });
        return { id: property.id, status: "no_match", reason: trace.reason };
      } catch (error) {
        return {
          id: property.id,
          status: "error",
          message:
            error instanceof Error ? error.message : "Unknown trace error.",
        };
      }
    });

    const matched = results.filter((item) => item.status === "matched").length;

    return ok({
      processed: results.length,
      matched,
      results,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
