import { NonRetriableError } from "inngest";
import { SkipTraceJobStatus } from "@prisma/client";
import { inngest } from "@/lib/inngest/client";
import { chunk } from "@/lib/concurrency";
import { fetchCountyRecords } from "@/lib/providers/public-records";
import { ingestProperties } from "@/lib/services/scrape";
import {
  markJobRunning,
  markJobFinished,
  incrementJobProgress,
  processSkipTraceChunk,
} from "@/lib/services/skip-trace";

/**
 * How many properties each durable step processes. A large batch is split into
 * chunks so every chunk is an independently-retryable Inngest step with bounded
 * memory and visible progress (the job's counters advance per chunk).
 */
const CHUNK_SIZE = 25;

/** County rows pulled per scheduled ingestion run. */
const COUNTY_BATCH_SIZE = 100;

/**
 * Durable skip-trace batch worker.
 *
 * Triggered by `skip-trace/job.requested`. Marks the job RUNNING, drains the
 * property ids chunk-by-chunk (each chunk a retryable step that updates the
 * job's progress counters), then marks the job COMPLETED. If a chunk keeps
 * failing past the retry budget, `onFailure` records the job as FAILED so the
 * UI never polls a job that is silently stuck.
 */
export const skipTraceJob = inngest.createFunction(
  {
    id: "skip-trace-batch",
    name: "Skip-trace batch worker",
    // Bound concurrent runs so large batches cannot exhaust the DB pool.
    concurrency: { limit: 5 },
    retries: 3,
    onFailure: async ({ event }) => {
      // The original triggering event is carried on the failure payload.
      const original = event.data.event;
      if (original.name === "skip-trace/job.requested") {
        await markJobFinished(original.data.jobId, SkipTraceJobStatus.FAILED);
      }
    },
  },
  { event: "skip-trace/job.requested" },
  async ({ event, step, logger }) => {
    const { jobId, propertyIds, concurrency } = event.data;

    await step.run("mark-running", () => markJobRunning(jobId));

    const chunks = chunk(propertyIds, CHUNK_SIZE);
    let completed = 0;
    let failed = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      const progress = await step.run(`process-chunk-${index}`, async () => {
        const result = await processSkipTraceChunk(chunks[index], concurrency);
        await incrementJobProgress(jobId, result);
        return result;
      });
      completed += progress.completed;
      failed += progress.failed;
    }

    await step.run("mark-finished", () =>
      markJobFinished(jobId, SkipTraceJobStatus.COMPLETED),
    );

    logger.info("skip-trace batch complete", {
      jobId,
      total: propertyIds.length,
      completed,
      failed,
    });

    return { jobId, total: propertyIds.length, completed, failed };
  },
);

/**
 * Durable smoke-test job (Phase 2 acceptance gate: "a durable test job runs
 * end-to-end with retries and logging"). Trigger it by sending the
 * `test/hello.world` event from any authenticated route, the Inngest dev UI, or
 * the dashboard. Each step is memoized on retry, demonstrating durability.
 */
export const testJob = inngest.createFunction(
  { id: "test-hello-world", name: "Hello-world durable test", retries: 2 },
  { event: "test/hello.world" },
  async ({ event, step, logger }) => {
    const marker = event.data.marker;

    const greeting = await step.run("build-greeting", () => {
      if (!marker) {
        // Non-retriable: bad input will never succeed on retry.
        throw new NonRetriableError("marker is required");
      }
      return `hello:${marker}`;
    });

    await step.sleep("settle", "1s");

    const finishedAt = await step.run("finish", () => new Date().toISOString());

    logger.info("hello-world test job complete", { marker, greeting });
    return { greeting, finishedAt };
  },
);

/**
 * Scheduled county / public-records ingestion (Phase 3).
 *
 * Runs daily at 07:00 UTC, pulls a batch from the configured public-records
 * source (or the simulation), and ingests it as RAW leads through the same
 * idempotent service the webhook uses. De-duplication means overlapping daily
 * pulls never create duplicate rows.
 */
export const countyIngestCron = inngest.createFunction(
  { id: "county-records-ingest", name: "County records scheduled ingest", retries: 2 },
  { cron: "0 7 * * *" },
  async ({ step, logger }) => {
    const source = process.env.PUBLIC_RECORDS_SOURCE_LABEL ?? "county-records";

    const properties = await step.run("pull-county-records", () =>
      fetchCountyRecords({ limit: COUNTY_BATCH_SIZE, source }),
    );

    const summary = await step.run("ingest-county-records", () =>
      ingestProperties({ properties }),
    );

    logger.info("county ingest complete", { source, ...summary });
    return summary;
  },
);

/** All functions served by the Inngest endpoint. */
export const functions = [skipTraceJob, testJob, countyIngestCron];
