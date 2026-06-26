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
import { getConversationContext } from "@/lib/services/conversation";
import { getAgentConfig } from "@/lib/services/agent-config";
import { getComplianceConfig } from "@/lib/services/compliance-config";
import { generateAgentProposal, type AgentProposal } from "@/lib/agent/llm";
import { createDraft } from "@/lib/services/drafts";

const CHUNK_SIZE = 25;
const COUNTY_BATCH_SIZE = 100;

/** Durable skip-trace batch worker (Phase 2). */
export const skipTraceJob = inngest.createFunction(
  {
    id: "skip-trace-batch",
    name: "Skip-trace batch worker",
    concurrency: { limit: 5 },
    retries: 3,
    onFailure: async ({ event }) => {
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

    logger.info("skip-trace batch complete", { jobId, total: propertyIds.length, completed, failed });
    return { jobId, total: propertyIds.length, completed, failed };
  },
);

/** Durable smoke-test job (Phase 2). */
export const testJob = inngest.createFunction(
  { id: "test-hello-world", name: "Hello-world durable test", retries: 2 },
  { event: "test/hello.world" },
  async ({ event, step, logger }) => {
    const marker = event.data.marker;
    const greeting = await step.run("build-greeting", () => {
      if (!marker) throw new NonRetriableError("marker is required");
      return `hello:${marker}`;
    });
    await step.sleep("settle", "1s");
    const finishedAt = await step.run("finish", () => new Date().toISOString());
    logger.info("hello-world test job complete", { marker, greeting });
    return { greeting, finishedAt };
  },
);

/** Scheduled county / public-records ingestion (Phase 3). */
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

/**
 * Live agent draft worker (Phase 5, draft-for-approval). Inbound reply ->
 * Claude structured proposal -> PENDING AgentDraft for human approval. Never
 * sends (approval does, re-checking the gate). No-ops on pause/opt-out/missing
 * config. Context/config reads run directly (idempotent) because Inngest
 * JSON-serializes step output, which would strip the precise enum types the
 * agent input requires; only the LLM call and the draft write are durable steps.
 */
export const agentDraftReply = inngest.createFunction(
  { id: "agent-draft-reply", name: "Agent draft reply", concurrency: { limit: 5 }, retries: 2 },
  { event: "agent/reply.requested" },
  async ({ event, step, logger }) => {
    const { conversationId } = event.data;

    const context = await getConversationContext(conversationId);
    if (!context) return { skipped: "conversation-not-found" };
    if (context.conversation.paused || context.conversation.state === "OPTED_OUT") {
      return { skipped: "paused-or-opted-out" };
    }

    const [agentConfig, complianceConfig] = await Promise.all([
      getAgentConfig(),
      getComplianceConfig(),
    ]);
    const businessName = complianceConfig?.businessName;
    const scriptTemplate = agentConfig?.scriptTemplate;
    if (!businessName || !scriptTemplate) {
      return { skipped: "agent-or-compliance-config-missing" };
    }

    const proposal = (await step.run("generate-proposal", () =>
      generateAgentProposal({
        businessName,
        tone: agentConfig?.tone ?? "Professional",
        objectives: agentConfig?.objectives ?? [],
        channel: context.conversation.channel,
        property: {
          ownerName: context.property.ownerName,
          address: context.property.address,
          city: context.property.city,
          state: context.property.state,
        },
        scriptTemplate,
        transcript: context.transcript,
      }),
    )) as unknown as AgentProposal;

    const draft = await step.run("create-draft", () =>
      createDraft({
        conversationId,
        propertyId: context.conversation.propertyId,
        channel: context.conversation.channel,
        body: proposal.reply,
        proposedState: proposal.nextState,
        qualified: proposal.qualified,
        reasoning: proposal.reasoning,
      }),
    );

    logger.info("agent draft created", {
      conversationId,
      draftId: draft.id,
      nextState: proposal.nextState,
      qualified: proposal.qualified,
    });
    return { draftId: draft.id, nextState: proposal.nextState };
  },
);

/** All functions served by the Inngest endpoint. */
export const functions = [skipTraceJob, testJob, countyIngestCron, agentDraftReply];
