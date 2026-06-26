import "server-only";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { normalizePhone } from "@/lib/compliance/normalize";
import { classifyInbound, type InboundIntent } from "@/lib/compliance/keywords";
import type { InboundSms } from "@/lib/webhooks/inbound-sms";
import { addSuppression, removeSuppression } from "@/lib/services/suppression";
import { getComplianceConfig } from "@/lib/services/compliance-config";
import {
  getOrCreateConversation,
  logMessage,
  setConversationState,
} from "@/lib/services/conversation";
import { sendSms } from "@/lib/providers/sms";

/**
 * Inbound SMS handler — the opt-out engine + agent hand-off.
 *
 * Runs after the route has cryptographically verified the delivery. STOP is
 * honored unconditionally and first (the suppression is keyed on the phone, not
 * a property, so it works even if we cannot match the sender to a lead). HELP
 * and START auto-respond best-effort. A genuine REPLY is handed to the Phase 5
 * agent (`agent/reply.requested`), which writes a draft for human approval —
 * never an auto-send. A missing SMS provider never fails the webhook (we still
 * return 200 so the carrier does not retry).
 */

export interface InboundActionResult {
  intent: InboundIntent;
  /** True when the suppression ledger changed (STOP added / START removed). */
  ledgerChanged: boolean;
  /** True when we matched the sender to a property/conversation. */
  matchedProperty: boolean;
  /** True when an auto-reply was dispatched. */
  autoReplied: boolean;
  /** True when a REPLY was handed to the agent for drafting. */
  agentEnqueued: boolean;
}

/** Best-effort: match the inbound sender to a property by owner phone. */
async function findPropertyByPhone(rawFrom: string, normalizedFrom: string | null) {
  const candidates = Array.from(
    new Set([rawFrom, normalizedFrom].filter((v): v is string => Boolean(v))),
  );
  if (candidates.length === 0) return null;
  return prisma.property.findFirst({
    where: { ownerPhone: { in: candidates } },
    select: { id: true },
  });
}

/** Best-effort auto-reply; swallows provider/config errors. Returns success. */
async function tryAutoReply(args: {
  to: string;
  from: string | null;
  body: string;
  conversationId: string | null;
}): Promise<boolean> {
  if (!args.from) return false;
  try {
    const result = await sendSms({ to: args.to, from: args.from, body: args.body });
    if (args.conversationId) {
      await logMessage({
        conversationId: args.conversationId,
        direction: "OUT",
        body: args.body,
        providerSid: result.providerSid,
        status: "sent",
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function handleInboundSms(
  inbound: InboundSms,
): Promise<InboundActionResult> {
  const intent = classifyInbound(inbound.body);
  const normalizedFrom = normalizePhone(inbound.from);
  const config = await getComplianceConfig();

  // Match sender -> property -> conversation (best effort).
  const property = await findPropertyByPhone(inbound.from, normalizedFrom);
  let conversationId: string | null = null;
  let conversationPaused = false;
  let conversationOptedOut = false;
  if (property) {
    const conversation = await getOrCreateConversation({
      propertyId: property.id,
      channel: "SMS",
      assignedNumber: inbound.to,
    });
    conversationId = conversation.id;
    conversationPaused = conversation.paused;
    conversationOptedOut = conversation.state === "OPTED_OUT";
    await logMessage({
      conversationId: conversation.id,
      direction: "IN",
      body: inbound.body,
      providerSid: inbound.providerSid,
      status: "received",
    });
  }

  let ledgerChanged = false;
  let autoReplied = false;
  let agentEnqueued = false;

  if (intent === "STOP") {
    const row = await addSuppression({
      value: inbound.from,
      channel: "SMS",
      reason: "STOP",
      detail: "Inbound STOP keyword",
    });
    ledgerChanged = row !== null;
    if (conversationId) await setConversationState(conversationId, "OPTED_OUT");

    if (config) {
      autoReplied = await tryAutoReply({
        to: inbound.from,
        from: config.smsFromNumber,
        body: `${config.businessName}: You're unsubscribed and will receive no more messages. Reply START to resubscribe.`,
        conversationId,
      });
    }
  } else if (intent === "START") {
    ledgerChanged = await removeSuppression(inbound.from, "SMS");
    if (config) {
      autoReplied = await tryAutoReply({
        to: inbound.from,
        from: config.smsFromNumber,
        body: `${config.businessName}: You're resubscribed. Reply STOP to opt out, HELP for help.`,
        conversationId,
      });
    }
  } else if (intent === "HELP") {
    if (config) {
      autoReplied = await tryAutoReply({
        to: inbound.from,
        from: config.smsFromNumber,
        body: `${config.businessName}: Support ${config.supportEmail}. Msg&data rates may apply. Reply STOP to opt out.`,
        conversationId,
      });
    }
  } else {
    // REPLY — hand off to the Phase 5 agent (draft-for-approval). It re-checks
    // pause/opt-out and writes a PENDING draft; it never auto-sends. Skip when
    // there is no matched conversation, or it is paused / already opted out.
    if (conversationId && !conversationPaused && !conversationOptedOut) {
      await inngest.send({
        name: "agent/reply.requested",
        data: { conversationId },
      });
      agentEnqueued = true;
    }
  }

  return {
    intent,
    ledgerChanged,
    matchedProperty: property !== null,
    autoReplied,
    agentEnqueued,
  };
}
