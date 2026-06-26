import type { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api";
import { complianceConfigSchema } from "@/lib/validations";
import {
  getComplianceConfig,
  saveComplianceConfig,
} from "@/lib/services/compliance-config";

// Prisma requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/compliance-config — the active compliance configuration, or null.
 */
export async function GET() {
  try {
    const config = await getComplianceConfig();
    return ok(config, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/compliance-config — validate and persist the compliance config
 * (sender identity, quiet hours, frequency cap, consent-text version, and the
 * global kill switch). Invalid payloads return 422. Changes take effect on the
 * next send — the gate reads this row every evaluation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = complianceConfigSchema.parse(body);
    const config = await saveComplianceConfig(input);
    return ok(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
