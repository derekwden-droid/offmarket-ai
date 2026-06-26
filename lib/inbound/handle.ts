import "server-only";
import { prisma } from "@/lib/prisma";
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
 * Inbound SMS handler — the opt-out engine.
 *
 * Runs after the route has cryptographically verified the delivery. STOP is
 * honored unconditionally and first (the suppression is keyed on the phone, not
 * a property, so it works even if we cannot match the sender to a lead). HELP
 * and START auto-respond best-effort; a missing SMS provider never fails the
 * webhook (we still return 200 so the carrier does not retry).
 */

export interface InboundActionResult {
  intent: InboundIntent;
  /** True when the suppression ledger changed (STOP added / START removed). */
  ledgerChanged: boolean;
  /** True when we matched the sender to a property/conversation. */
  matchedProperty: boolean;
  /** True when an auto-reply was dispatched. */
  autoReplied: boolean;
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
  if (property) {
    const conversation = await getOrCreateConversation({
      propertyId: property.id,
      channel: "SMS",
      assignedNumber: inbound.to,
    });
    conversationId = conversation.id;
    await logMessage({
      conversationId,
      direction: "IN",
      body: inbound.body,
      providerSid: inbound.providerSid,
      status: "received",
    });
  }

  let ledgerChanged = false;
  let autoReplied = false;

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
  }
  // REPLY: logged above; the Phase 5 agent state machine takes it from here.

  return {
    intent,
    ledgerChanged,
    matchedProperty: property !== null,
    autoReplied,
  };
}
