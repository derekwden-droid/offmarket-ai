"use server";

import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueSkipTraceJob, getSkipTraceJob } from "@/lib/services/skip-trace";
import type { SkipTraceJobStatus } from "@prisma/client";

/**
 * Server actions backing the live Skip Trace page.
 *
 * The browser cannot hold `INTERNAL_API_SECRET`, so the UI drives the live
 * worker through these actions (which run server-side and call the service layer
 * directly) rather than the protected `/api/skip-trace` HTTP route. Dates are
 * serialized to ISO strings to match the client DTOs.
 */

export interface TraceablePropertyDTO {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  status: LeadStatus;
}

export interface SkipTraceJobDTO {
  id: string;
  status: SkipTraceJobStatus;
  total: number;
  completed: number;
  failed: number;
  createdAt: string;
  finishedAt: string | null;
}

/** Load the untraced (RAW) queue, newest first, capped for the table. */
export async function loadTraceablePropertiesAction(): Promise<{
  properties: TraceablePropertyDTO[];
  rawTotal: number;
}> {
  const [properties, rawTotal] = await Promise.all([
    prisma.property.findMany({
      where: { status: LeadStatus.RAW },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        propertyType: true,
        status: true,
      },
    }),
    prisma.property.count({ where: { status: LeadStatus.RAW } }),
  ]);

  return { properties, rawTotal };
}

/** Enqueue a skip-trace batch (row or batch) and return its job id. */
export async function enqueueSkipTraceAction(
  propertyIds: string[],
  concurrency?: number,
): Promise<{ jobId: string; status: SkipTraceJobStatus; total: number }> {
  return enqueueSkipTraceJob({ propertyIds, concurrency });
}

/** Poll a job's progress; null when the id is unknown. */
export async function getSkipTraceJobAction(
  jobId: string,
): Promise<SkipTraceJobDTO | null> {
  const job = await getSkipTraceJob(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };
}
