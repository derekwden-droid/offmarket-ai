"use server";

import type { Channel } from "@prisma/client";
import { agentConfigSchema, type AgentThresholds } from "@/lib/validations";
import { getAgentConfig, saveAgentConfig } from "@/lib/services/agent-config";

/**
 * Server actions for the outreach agent configuration. The save action
 * validates with the shared Zod schema before persisting, returning a
 * discriminated result so the client can surface field errors without a thrown
 * exception crossing the server-action boundary.
 */

export interface AgentConfigDTO {
  id: string;
  tone: string;
  objectives: string[];
  channels: Channel[];
  scriptTemplate: string;
  thresholds: AgentThresholds;
  updatedAt: string;
}

export type SaveAgentConfigResult =
  | { ok: true; data: AgentConfigDTO }
  | { ok: false; error: string };

function toDTO(config: {
  id: string;
  tone: string;
  objectives: string[];
  channels: Channel[];
  scriptTemplate: string;
  thresholds: unknown;
  updatedAt: Date;
}): AgentConfigDTO {
  return {
    id: config.id,
    tone: config.tone,
    objectives: config.objectives,
    channels: config.channels,
    scriptTemplate: config.scriptTemplate,
    thresholds: config.thresholds as AgentThresholds,
    updatedAt: config.updatedAt.toISOString(),
  };
}

/** Load the saved agent configuration, or null when none exists yet. */
export async function loadAgentConfigAction(): Promise<AgentConfigDTO | null> {
  const config = await getAgentConfig();
  return config ? toDTO(config) : null;
}

/** Validate and persist the agent configuration. */
export async function saveAgentConfigAction(
  input: unknown,
): Promise<SaveAgentConfigResult> {
  const parsed = agentConfigSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid configuration.",
    };
  }
  const config = await saveAgentConfig(parsed.data);
  return { ok: true, data: toDTO(config) };
}
