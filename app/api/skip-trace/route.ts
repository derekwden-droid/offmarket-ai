import type { NextRequest } from "next/server";
import { ok, handleRouteError } from "@/lib/api";
import { skipTraceRequestSchema } from "@/lib/validations";
import { enqueueSkipTraceJob } from "@/lib/services/skip-trace";

// Prisma + event dispatch require the Node.js runtime.
export const runtime = "nodejs";

/**
 * POST /api/skip-trace
 * Enqueue a background skip-trace batch and return its job id immediately. The
 * durable Inngest worker (`skip-trace-batch`) resolves owner contact details
 * off the request path with bounded concurrency, advancing each property to
 * SKIP_TRACED and updating the job's progress counters. Poll
 * GET /api/skip-trace/{jobId} for status.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { propertyIds, concurrency } = skipTraceRequestSchema.parse(body);

    const job = await enqueueSkipTraceJob({ propertyIds, concurrency });

    // 202 Accepted: work has been queued, not completed.
    return ok(job, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
