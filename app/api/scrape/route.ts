import type { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api";
import { scrapeRequestSchema } from "@/lib/validations";
import { ingestProperties } from "@/lib/services/scrape";
import { verifyWebhookSignature } from "@/lib/webhook";

// Prisma + crypto require the Node.js runtime (not Edge-compatible).
export const runtime = "nodejs";

/**
 * POST /api/scrape — signed webhook receiver for inbound property batches.
 *
 * Authentication is the HMAC signature (SCRAPE_WEBHOOK_SECRET), not the internal
 * API secret — this route is excluded from that middleware gate so external
 * scrapers can post. Validation is Zod (422 on bad shape); ingestion is
 * idempotent (the composite-key dedupe means a replayed batch creates 0 rows).
 */
export async function POST(request: NextRequest) {
  try {
    // Read the raw body first: the signature is computed over the exact bytes.
    const rawBody = await request.text();

    const verification = verifyWebhookSignature({
      rawBody,
      signature: request.headers.get("x-scrape-signature"),
      timestamp: request.headers.get("x-scrape-timestamp"),
      secret: process.env.SCRAPE_WEBHOOK_SECRET,
    });

    if (!verification.valid) {
      return fail("UNAUTHORIZED", verification.reason, 401);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return fail("VALIDATION_ERROR", "Request body is not valid JSON.", 422);
    }

    const { properties, listPackageId } = scrapeRequestSchema.parse(parsedBody);
    const summary = await ingestProperties({ properties, listPackageId });

    return ok(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
