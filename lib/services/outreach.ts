import "server-only";
import { LeadStatus, type Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateSend, type ComplianceDecision } from "@/lib/compliance/gate";
import {
  getOrCreateConversation,
  logMessage,
  setConversationState,
} from "@/lib/services/conversation";
import { getComplianceConfig } from "@/lib/services/compliance-config";
import { getAgentConfig } from "@/lib/services/agent-config";
import { sendSms } from "@/lib/providers/sms";
import { sendEmail, canSpamFooter, escapeHtml } from "@/lib/providers/email";
import { buildUnsubscribeUrl } from "@/lib/unsubscribe";
import { renderTemplate } from "@/lib/agent/prompt";
import {
  recordSendOk,
  recordSendFailed,
  recordSendBlocked,
} from "@/lib/observability";

/**
 * Outreach send service — the ONE outbound path.
 *
 * Initial outreach and every approved agent reply funnel through `sendOutreach`,
 * which re-checks the compliance gate (`evaluateSend`) immediately before
 * dispatch, honors the per-conversation pause, builds a CAN-SPAM compliant email
 * (postal address + one-click unsubscribe wired to Suppression), sends via the
 * configured provider, and logs the transcript. Nothing else calls the SMS/email
 * providers for marketing, so suppression/quiet-hours/consent can never be
 * bypassed.
 */

export type OutreachBlockReason =
  | "NO_RECIPIENT"
  | "PAUSED"
  | "GATE_BLOCKED"
  | "UNSUBSCRIBE_NOT_CONFIGURED";

export interface OutreachSendResult {
  sent: boolean;
  conversationId: string | null;
  providerSid?: string;
  /** Present when `sent` is false. */
  blockReason?: OutreachBlockReason;
  /** The gate decision (present whenever the gate was evaluated). */
  decision?: ComplianceDecision;
  detail?: string;
}

const APP_BASE_URL =
  process.env.APP_BASE_URL ?? "https://offmarket-ai.vercel.app";

interface SendOutreachInput {
  propertyId: string;
  channel: Channel;
  body: string;
  /** Existing conversation; when omitted one is created on a successful send. */
  conversationId?: string;
}

/** Send one outreach message after re-checking the gate. Never throws on a block. */
export async function sendOutreach(
  input: SendOutreachInput,
): Promise<OutreachSendResult> {
  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: {
      id: true,
      ownerPhone: true,
      ownerEmail: true,
      address: true,
    },
  });
  if (!property) {
    return { sent: false, conversationId: null, blockReason: "NO_RECIPIENT", detail: "Property not found." };
  }

  const recipient =
    input.channel === "SMS" ? property.ownerPhone : property.ownerEmail;
  if (!recipient) {
    return {
      sent: false,
      conversationId: input.conversationId ?? null,
      blockReason: "NO_RECIPIENT",
      detail: `Property has no owner ${input.channel === "SMS" ? "phone" : "email"}.`,
    };
  }

  // Per-conversation pause (cheap, checked before the gate).
  if (input.conversationId) {
    const convo = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { paused: true },
    });
    if (convo?.paused) {
      recordSendBlocked({ channel: input.channel, reason: "PAUSED", conversationId: input.conversationId });
      return { sent: false, conversationId: input.conversationId, blockReason: "PAUSED", detail: "Conversation is paused." };
    }
  }

  // The compliance gate — consent, suppression, DNC, quiet hours, caps, kill switch.
  const decision = await evaluateSend({
    channel: input.channel,
    recipient,
    propertyId: input.propertyId,
  });
  if (!decision.allowed) {
    recordSendBlocked({
      channel: input.channel,
      reason: decision.reason ?? "GATE_BLOCKED",
      conversationId: input.conversationId ?? null,
    });
    return {
      sent: false,
      conversationId: input.conversationId ?? null,
      blockReason: "GATE_BLOCKED",
      decision,
      detail: decision.detail,
    };
  }

  const config = await getComplianceConfig();
  const conversation = input.conversationId
    ? { id: input.conversationId }
    : await getOrCreateConversation({
        propertyId: input.propertyId,
        channel: input.channel,
        assignedNumber: config?.smsFromNumber ?? null,
      });

  let providerSid: string;
  if (input.channel === "SMS") {
    const from = config?.smsFromNumber;
    if (!from) {
      return { sent: false, conversationId: conversation.id, blockReason: "GATE_BLOCKED", decision, detail: "No SMS from-number configured." };
    }
    try {
      const result = await sendSms({ to: recipient, from, body: input.body });
      providerSid = result.providerSid;
    } catch (error) {
      recordSendFailed(error, { channel: "SMS", conversationId: conversation.id });
      return {
        sent: false,
        conversationId: conversation.id,
        blockReason: "GATE_BLOCKED",
        decision,
        detail: error instanceof Error ? error.message : "SMS provider send failed.",
      };
    }
  } else {
    const secret = process.env.UNSUBSCRIBE_SECRET;
    if (!secret || !config) {
      return {
        sent: false,
        conversationId: conversation.id,
        blockReason: "UNSUBSCRIBE_NOT_CONFIGURED",
        decision,
        detail: "UNSUBSCRIBE_SECRET / compliance config required for CAN-SPAM email.",
      };
    }
    const unsubscribeUrl = buildUnsubscribeUrl(APP_BASE_URL, recipient, secret);
    const footer = canSpamFooter({
      businessName: config.businessName,
      physicalAddress: config.physicalAddress,
      unsubscribeUrl,
    });
    const html = `<div style="font-family:sans-serif;font-size:14px;color:#111827;line-height:1.6">${escapeHtml(input.body).replace(/\n/g, "<br/>")}</div>${footer.html}`;
    try {
      const result = await sendEmail({
        to: recipient,
        subject: `Regarding ${property.address}`,
        html,
        text: `${input.body}${footer.text}`,
      });
      providerSid = result.providerSid;
    } catch (error) {
      recordSendFailed(error, { channel: "EMAIL", conversationId: conversation.id });
      return {
        sent: false,
        conversationId: conversation.id,
        blockReason: "GATE_BLOCKED",
        decision,
        detail: error instanceof Error ? error.message : "Email provider send failed.",
      };
    }
  }

  await logMessage({
    conversationId: conversation.id,
    direction: "OUT",
    body: input.body,
    providerSid,
    status: "sent",
  });

  recordSendOk({ channel: input.channel, providerSid, conversationId: conversation.id });
  return { sent: true, conversationId: conversation.id, providerSid, decision };
}

export interface StartOutreachInput {
  propertyId: string;
  channel: Channel;
}

/**
 * Open a thread: render the AgentConfig opening script for the property and send
 * it through `sendOutreach`. On success the property advances to AI_CONTACTED
 * and the conversation to CONTACTED.
 */
export async function startOutreach(
  input: StartOutreachInput,
): Promise<OutreachSendResult> {
  const agentConfig = await getAgentConfig();
  if (!agentConfig) {
    return { sent: false, conversationId: null, blockReason: "GATE_BLOCKED", detail: "No AgentConfig saved; set the opening script first." };
  }

  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: { ownerName: true, address: true, city: true, state: true },
  });
  if (!property) {
    return { sent: false, conversationId: null, blockReason: "NO_RECIPIENT", detail: "Property not found." };
  }

  const body = renderTemplate(agentConfig.scriptTemplate, property);

  const conversation = await getOrCreateConversation({
    propertyId: input.propertyId,
    channel: input.channel,
  });

  const result = await sendOutreach({
    propertyId: input.propertyId,
    channel: input.channel,
    body,
    conversationId: conversation.id,
  });

  if (result.sent) {
    await Promise.all([
      prisma.property.update({
        where: { id: input.propertyId },
        data: { status: LeadStatus.AI_CONTACTED },
      }),
      setConversationState(conversation.id, "CONTACTED"),
    ]);
  }

  return result;
}
