import "server-only";
import { LeadStatus, SkipTraceJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { mapWithConcurrency } from "@/lib/concurrency";
import { skipTrace } from "@/lib/providers/skip-trace";

/**
 * Skip-trace service layer.
 *
 * The HTTP route, the server actions, and the Inngest worker all go through
 * these functions so the enqueue contract and the per-property write logic live
 * in exactly one place. The route/actions enqueue; the worker drains.
 */

const DEFAULT_CONCURRENCY = 5;

/** Outcome of resolving and persisting a single property. */
export type SkipTraceItemOutcome = "matched" | "no_match" | "error";

export interface EnqueueSkipTraceInput {
  propertyIds: string[];
  concurrency?: number;
}

export interface EnqueueSkipTraceResult {
  jobId: string;
  status: SkipTraceJobStatus;
  total: number;
}

/** Progress counters accumulated as a job drains. */
export interface ChunkProgress {
  completed: number;
  failed: number;
}

/**
 * Create a `SkipTraceJob` row and emit the event that triggers the durable
 * worker. Returns immediately with the job id so the request never blocks on
 * provider calls. De-duplicates the incoming ids so `total` is accurate.
 */
export async function enqueueSkipTraceJob(
  input: EnqueueSkipTraceInput,
): Promise<EnqueueSkipTraceResult> {
  const propertyIds = Array.from(new Set(input.propertyIds));
  const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY;

  const job = await prisma.skipTraceJob.create({
    data: {
      total: propertyIds.length,
      status: SkipTraceJobStatus.PENDING,
    },
    select: { id: true, status: true, total: true },
  });

  await inngest.send({
    name: "skip-trace/job.requested",
    data: { jobId: job.id, propertyIds, concurrency },
  });

  return { jobId: job.id, status: job.status, total: job.total };
}

/** Read a job's current state, or null when the id is unknown. */
export async function getSkipTraceJob(jobId: string) {
  return prisma.skipTraceJob.findUnique({ where: { id: jobId } });
}

/** Transition a job to RUNNING. Idempotent for worker retries. */
export async function markJobRunning(jobId: string): Promise<void> {
  await prisma.skipTraceJob.update({
    where: { id: jobId },
    data: { status: SkipTraceJobStatus.RUNNING },
  });
}

/** Finalize a job with a terminal status and a finish timestamp. */
export async function markJobFinished(
  jobId: string,
  status: SkipTraceJobStatus,
): Promise<void> {
  await prisma.skipTraceJob.update({
    where: { id: jobId },
    data: { status, finishedAt: new Date() },
  });
}

/** Atomically advance the progress counters after a chunk drains. */
export async function incrementJobProgress(
  jobId: string,
  progress: ChunkProgress,
): Promise<void> {
  await prisma.skipTraceJob.update({
    where: { id: jobId },
    data: {
      completed: { increment: progress.completed },
      failed: { increment: progress.failed },
    },
  });
}

/**
 * Resolve owner contact details for one property and persist the result.
 * The property always advances to SKIP_TRACED whether or not a match is found;
 * a thrown provider/database error is reported as "error" so the caller can
 * count it without aborting the rest of the batch.
 */
export async function traceAndPersistProperty(
  propertyId: string,
): Promise<SkipTraceItemOutcome> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, address: true, city: true, state: true, zip: true },
  });

  if (!property) {
    return "error";
  }

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
      return "matched";
    }

    await prisma.property.update({
      where: { id: property.id },
      data: { status: LeadStatus.SKIP_TRACED },
    });
    return "no_match";
  } catch {
    return "error";
  }
}

/**
 * Process one chunk of property ids with bounded concurrency, returning the
 * completed (matched or no-match) and failed (errored) counts for the chunk.
 */
export async function processSkipTraceChunk(
  propertyIds: readonly string[],
  concurrency: number,
): Promise<ChunkProgress> {
  const outcomes = await mapWithConcurrency(
    propertyIds,
    concurrency,
    (id) => traceAndPersistProperty(id),
  );

  let completed = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome === "error") failed += 1;
    else completed += 1;
  }
  return { completed, failed };
}
