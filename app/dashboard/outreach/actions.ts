"use server";

import type { Channel, ConversationState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  agentConfigSchema,
  startOutreachSchema,
  approveDraftSchema,
  type AgentThresholds,
} from "@/lib/validations";
import { getAgentConfig, saveAgentConfig } from "@/lib/services/agent-config";
import { startOutreach } from "@/lib/services/outreach";
import { listPendingDrafts, approveDraft, rejectDraft } from "@/lib/services/drafts";
import { setConversationPaused } from "@/lib/services/conversation";

/**
 * Server actions for the live Outreach workspace.
 *
 * The browser never holds `INTERNAL_API_SECRET`, so the UI drives the agent
 * config, outreach sends, and draft approvals through these server-side actions
 * (which call the service layer directly). Every send still passes the
 * compliance gate inside `sendOutreach`. Dates are serialized to ISO.
 */

// ---- Agent config (Phase 2, retained) -------------------------------------

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

function toConfigDTO(config: {
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

export async function loadAgentConfigAction(): Promise<AgentConfigDTO | null> {
  const config = await getAgentConfig();
  return config ? toConfigDTO(config) : null;
}

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
  return { ok: true, data: toConfigDTO(config) };
}

// ---- Live outreach queue (Phase 5) ----------------------------------------

export interface DraftDTO {
  id: string;
  conversationId: string;
  propertyId: string;
  channel: Channel;
  body: string;
  proposedState: ConversationState;
  qualified: boolean;
  reasoning: string | null;
  conversationState: ConversationState;
  paused: boolean;
  ownerName: string | null;
  address: string;
  city: string;
  state: string;
  createdAt: string;
}

export interface TraceablePropertyDTO {
  id: string;
  ownerName: string | null;
  address: string;
  city: string;
  state: string;
  hasPhone: boolean;
  hasEmail: boolean;
}

export interface OutreachQueueDTO {
  drafts: DraftDTO[];
  startable: TraceablePropertyDTO[];
}

/** Load pending drafts + properties eligible to start outreach. */
export async function loadOutreachQueueAction(): Promise<OutreachQueueDTO> {
  const [drafts, startable] = await Promise.all([
    listPendingDrafts(50),
    prisma.property.findMany({
      where: {
        status: "SKIP_TRACED",
        OR: [{ ownerPhone: { not: null } }, { ownerEmail: { not: null } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        ownerName: true,
        ownerPhone: true,
        ownerEmail: true,
        address: true,
        city: true,
        state: true,
      },
    }),
  ]);

  return {
    drafts: drafts.map((d) => ({
      id: d.id,
      conversationId: d.conversationId,
      propertyId: d.propertyId,
      channel: d.channel,
      body: d.body,
      proposedState: d.proposedState,
      qualified: d.qualified,
      reasoning: d.reasoning,
      conversationState: d.conversation.state,
      paused: d.conversation.paused,
      ownerName: d.conversation.property.ownerName,
      address: d.conversation.property.address,
      city: d.conversation.property.city,
      state: d.conversation.property.state,
      createdAt: d.createdAt.toISOString(),
    })),
    startable: startable.map((p) => ({
      id: p.id,
      ownerName: p.ownerName,
      address: p.address,
      city: p.city,
      state: p.state,
      hasPhone: p.ownerPhone !== null,
      hasEmail: p.ownerEmail !== null,
    })),
  };
}

export interface OutreachActionResult {
  ok: boolean;
  sent: boolean;
  detail: string;
  /** Gate block reason when the compliance gate blocked the send. */
  gateReason?: string | null;
}

/** Start a new outreach thread (sends the opening script through the gate). */
export async function startOutreachAction(
  input: unknown,
): Promise<OutreachActionResult> {
  const parsed = startOutreachSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, sent: false, detail: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input." };
  }
  const result = await startOutreach(parsed.data);
  return {
    ok: true,
    sent: result.sent,
    detail: result.detail ?? (result.sent ? "Sent." : "Blocked."),
    gateReason: result.decision?.reason ?? result.blockReason ?? null,
  };
}

/** Approve a pending draft (re-checks the gate, then sends). */
export async function approveDraftAction(
  input: unknown,
): Promise<OutreachActionResult> {
  const parsed = approveDraftSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, sent: false, detail: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input." };
  }
  const result = await approveDraft(parsed.data.draftId, parsed.data.editedBody);
  return {
    ok: result.approved,
    sent: result.send.sent,
    detail: result.send.detail ?? (result.send.sent ? "Sent." : "Blocked."),
    gateReason: result.send.decision?.reason ?? result.send.blockReason ?? null,
  };
}

/** Reject a pending draft (no send). */
export async function rejectDraftAction(draftId: string): Promise<{ ok: true }> {
  await rejectDraft(draftId);
  return { ok: true };
}

/** Pause or resume a conversation thread. */
export async function pauseConversationAction(
  conversationId: string,
  paused: boolean,
): Promise<{ ok: true; paused: boolean }> {
  await setConversationPaused(conversationId, paused);
  return { ok: true, paused };
}
