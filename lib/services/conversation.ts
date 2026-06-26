import "server-only";
import type { Channel, ConversationState, MessageDirection } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Conversation + Message service.
 *
 * One Conversation per (property, channel) holds the outreach thread; every
 * inbound and outbound line is logged as a Message. The send-time gate uses
 * `countRecentOutbound` to enforce the per-recipient frequency cap, and the
 * inbound webhook uses `logMessage` + `setConversationState` to record replies
 * and opt-outs.
 */

/** Find the open conversation for (property, channel) or create it. */
export async function getOrCreateConversation(args: {
  propertyId: string;
  channel: Channel;
  assignedNumber?: string | null;
}) {
  const existing = await prisma.conversation.findFirst({
    where: { propertyId: args.propertyId, channel: args.channel },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      propertyId: args.propertyId,
      channel: args.channel,
      assignedNumber: args.assignedNumber ?? null,
    },
  });
}

export interface LogMessageInput {
  conversationId: string;
  direction: MessageDirection;
  body: string;
  providerSid?: string | null;
  status?: string | null;
}

/** Append a message to a conversation transcript. */
export async function logMessage(input: LogMessageInput) {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: input.direction,
      body: input.body,
      providerSid: input.providerSid ?? null,
      status: input.status ?? null,
    },
  });
}

/** Move a conversation to a new state (e.g. OPTED_OUT after STOP). */
export async function setConversationState(
  conversationId: string,
  state: ConversationState,
) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { state },
  });
}

/**
 * Count outbound messages to a property on a channel since `since`. Backs the
 * per-recipient 24h frequency cap. One owner maps to one property here, so
 * property+channel is a faithful proxy for the recipient identity.
 */
export async function countRecentOutbound(args: {
  propertyId: string;
  channel: Channel;
  since: Date;
}): Promise<number> {
  return prisma.message.count({
    where: {
      direction: "OUT",
      createdAt: { gte: args.since },
      conversation: { propertyId: args.propertyId, channel: args.channel },
    },
  });
}

/** Resolve the property + owner contact behind a conversation (inbound routing). */
export async function findConversationContext(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      channel: true,
      property: {
        select: { id: true, ownerPhone: true, ownerEmail: true, state: true },
      },
    },
  });
}
