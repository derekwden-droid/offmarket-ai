import "server-only";
import { LeadStatus, type Channel, type ConversationState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOutreach, type OutreachSendResult } from "@/lib/services/outreach";
import { setConversationState } from "@/lib/services/conversation";

/**
 * Agent draft queue (draft-for-approval).
 *
 * The Inngest agent writes a PENDING draft (proposed reply + next state) for
 * each genuine inbound reply. A human reviews it in the Outreach workspace and
 * approves (optionally editing the text) or rejects. Approval re-checks the
 * compliance gate via `sendOutreach` before anything is dispatched, then logs
 * the send and advances the conversation/property state.
 */

export interface CreateDraftInput {
  conversationId: string;
  propertyId: string;
  channel: Channel;
  body: string;
  proposedState: ConversationState;
  qualified: boolean;
  reasoning: string;
}

export async function createDraft(input: CreateDraftInput) {
  return prisma.agentDraft.create({
    data: {
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      channel: input.channel,
      body: input.body,
      proposedState: input.proposedState,
      qualified: input.qualified,
      reasoning: input.reasoning,
    },
  });
}

/** Pending drafts with conversation + property context for the review queue. */
export async function listPendingDrafts(limit = 50) {
  return prisma.agentDraft.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      conversation: {
        select: {
          id: true,
          state: true,
          paused: true,
          property: {
            select: { id: true, ownerName: true, address: true, city: true, state: true },
          },
        },
      },
    },
  });
}

export async function getDraft(id: string) {
  return prisma.agentDraft.findUnique({ where: { id } });
}

export interface ApproveDraftResult {
  approved: boolean;
  send: OutreachSendResult;
}

/**
 * Approve a pending draft: re-check the gate and send (optionally with an edited
 * body), then mark APPROVED, advance the conversation to the proposed state, and
 * promote the property to QUALIFIED when the agent flagged it. If the gate
 * blocks at send time, the draft stays PENDING and the block reason is returned.
 */
export async function approveDraft(
  id: string,
  editedBody?: string,
): Promise<ApproveDraftResult> {
  const draft = await prisma.agentDraft.findUnique({ where: { id } });
  if (!draft || draft.status !== "PENDING") {
    return {
      approved: false,
      send: { sent: false, conversationId: null, blockReason: "GATE_BLOCKED", detail: "Draft not found or already decided." },
    };
  }

  const body = (editedBody ?? draft.body).trim();
  const send = await sendOutreach({
    propertyId: draft.propertyId,
    channel: draft.channel,
    body,
    conversationId: draft.conversationId,
  });

  if (!send.sent) {
    return { approved: false, send };
  }

  await prisma.agentDraft.update({
    where: { id },
    data: {
      status: "APPROVED",
      body,
      providerSid: send.providerSid ?? null,
      decidedAt: new Date(),
    },
  });

  await setConversationState(draft.conversationId, draft.proposedState);

  if (draft.qualified) {
    await prisma.property.update({
      where: { id: draft.propertyId },
      data: { status: LeadStatus.QUALIFIED },
    });
  }

  return { approved: true, send };
}

/** Reject a pending draft (no send). */
export async function rejectDraft(id: string) {
  return prisma.agentDraft.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
}
