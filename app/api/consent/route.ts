import type { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api";
import { consentRecordSchema } from "@/lib/validations";
import { recordConsent, listConsentRecords } from "@/lib/services/consent";

// Prisma requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/consent — list recent consent records (internal, secret-gated).
 */
export async function GET() {
  try {
    const records = await listConsentRecords();
    return ok(records, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/consent — record prior express written consent for a property +
 * channel. Invalid payloads return 422 via the shared error mapping. The send-
 * time gate blocks any send lacking a matching record, so this is the only way
 * a property becomes contactable.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = consentRecordSchema.parse(body);
    const record = await recordConsent(input);
    return ok(record, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
