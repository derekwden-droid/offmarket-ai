import type { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api";
import { agentConfigSchema } from "@/lib/validations";
import { getAgentConfig, saveAgentConfig } from "@/lib/services/agent-config";

// Prisma requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agent-config
 * Return the active outreach-agent configuration, or null when none is saved.
 */
export async function GET() {
  try {
    const config = await getAgentConfig();
    return ok(config, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/agent-config
 * Validate and persist the outreach-agent configuration (single active row).
 * Invalid payloads return 422 via the shared error mapping.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = agentConfigSchema.parse(body);
    const config = await saveAgentConfig(input);
    return ok(config);
  } catch (error) {
    return handleRouteError(error);
  }
}
