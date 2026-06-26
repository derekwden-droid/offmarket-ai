import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Inngest HTTP endpoint (GET for introspection, PUT to register, POST to run).
 *
 * This route is intentionally excluded from the `INTERNAL_API_SECRET` gate in
 * `middleware.ts`: Inngest authenticates its own calls with `INNGEST_SIGNING_KEY`
 * (request-signature verification), so the shared-secret gate must not block it.
 * Prisma + provider calls require the Node.js runtime.
 */
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
