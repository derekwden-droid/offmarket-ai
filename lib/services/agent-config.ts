import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentConfigInput } from "@/lib/validations";

/**
 * Agent-config service layer.
 *
 * The outreach agent reads a single active configuration. We model it as a
 * table (so historical edits could be retained) but expose a single-row API:
 * `getAgentConfig` returns the most recently updated row, and `saveAgentConfig`
 * updates that row in place (or creates the first one).
 */

/** The latest persisted agent configuration, or null when none exists yet. */
export async function getAgentConfig() {
  return prisma.agentConfig.findFirst({ orderBy: { updatedAt: "desc" } });
}

/**
 * Persist the agent configuration. Updates the single active row when present,
 * otherwise creates it. `thresholds` is stored as JSON.
 */
export async function saveAgentConfig(input: AgentConfigInput) {
  const existing = await prisma.agentConfig.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const data = {
    tone: input.tone,
    objectives: input.objectives,
    channels: input.channels,
    scriptTemplate: input.scriptTemplate,
    thresholds: input.thresholds as unknown as Prisma.InputJsonValue,
  };

  if (existing) {
    return prisma.agentConfig.update({ where: { id: existing.id }, data });
  }
  return prisma.agentConfig.create({ data });
}
