import type { NextRequest } from "next/server";
import { ok, fail, handleRouteError } from "@/lib/api";
import { getSkipTraceJob } from "@/lib/services/skip-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/skip-trace/{jobId}
 * Return the current state of a skip-trace job (status + progress counters) so
 * clients can poll a batch to completion. 404 when the id is unknown.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = await getSkipTraceJob(jobId);

    if (!job) {
      return fail("NOT_FOUND", "No skip-trace job with that id.", 404);
    }

    return ok(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
