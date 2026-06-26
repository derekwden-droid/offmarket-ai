import "server-only";
import type { Channel, SuppressionReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRecipient } from "@/lib/compliance/normalize";
import { evaluateQuietHours } from "@/lib/compliance/timezone";
import { scrubNationalDnc, type DncResult } from "@/lib/providers/dnc";
import { getComplianceConfig } from "@/lib/services/compliance-config";
import { hasConsent } from "@/lib/services/consent";
import { getSuppression, addSuppression } from "@/lib/services/suppression";
import { countRecentOutbound } from "@/lib/services/conversation";
import {
  composeDecision,
  type ComplianceDecision,
  type DecisionFacts,
  type GateConfig,
} from "@/lib/compliance/decision";

export type {
  ComplianceDecision,
  ComplianceBlockReason,
  ComplianceCheck,
  GateConfig,
} from "@/lib/compliance/decision";

/**
 * The send-time compliance gate — the safe-harbor backbone.
 *
 * EVERY outbound marketing message (Phase 5's SMS and email senders) must call
 * `evaluateSend` and proceed only on `allowed: true`. This module gathers the
 * facts; the pure `composeDecision` applies the ordered, fail-closed rules.
 * Dependencies are injectable so the orchestration is testable with fakes.
 *
 * Expensive/external work (DNC scrub, timezone, owner lookup) is skipped when a
 * cheaper check already blocks — `composeDecision` is authoritative and orders
 * those cheaper checks first, so skipping never changes the verdict.
 */

const FREQUENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface EvaluateSendInput {
  channel: Channel;
  recipient: string;
  propertyId: string;
  now?: Date;
}

export interface GateDeps {
  getConfig: () => Promise<GateConfig | null>;
  getPropertyState: (propertyId: string) => Promise<string | null | undefined>;
  hasConsent: (propertyId: string, channel: Channel) => Promise<boolean>;
  getSuppressionReason: (
    recipient: string,
    channel: Channel,
  ) => Promise<SuppressionReason | null>;
  scrubDnc: (phoneE164: string) => Promise<DncResult>;
  onDncDetected: (recipient: string, detail: string) => Promise<void>;
  countRecentOutbound: (
    propertyId: string,
    channel: Channel,
    since: Date,
  ) => Promise<number>;
}

export const defaultGateDeps: GateDeps = {
  getConfig: async () => {
    const c = await getComplianceConfig();
    return c
      ? {
          sendingEnabled: c.sendingEnabled,
          smsFromNumber: c.smsFromNumber,
          supportEmail: c.supportEmail,
          physicalAddress: c.physicalAddress,
          quietHoursStart: c.quietHoursStart,
          quietHoursEnd: c.quietHoursEnd,
          dailyCapPerRecipient: c.dailyCapPerRecipient,
        }
      : null;
  },
  getPropertyState: async (propertyId) => {
    const p = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { state: true },
    });
    return p?.state;
  },
  hasConsent,
  getSuppressionReason: async (recipient, channel) => {
    const row = await getSuppression(recipient, channel);
    return row?.reason ?? null;
  },
  scrubDnc: scrubNationalDnc,
  onDncDetected: async (recipient, detail) => {
    await addSuppression({ value: recipient, channel: "SMS", reason: "DNC", detail });
  },
  countRecentOutbound: (propertyId, channel, since) =>
    countRecentOutbound({ propertyId, channel, since }),
};

/**
 * Evaluate whether a message may be sent. Returns a structured decision; never
 * throws for a normal block (a DNC transport failure is caught and surfaces as
 * DNC_ERROR -> blocked, fail closed).
 */
export async function evaluateSend(
  input: EvaluateSendInput,
  deps: GateDeps = defaultGateDeps,
): Promise<ComplianceDecision> {
  const { channel, propertyId } = input;
  const now = input.now ?? new Date();

  const config = await deps.getConfig();
  const recipient = normalizeRecipient(input.recipient, channel);

  // Cheap, always-evaluated facts.
  const hasConsentFact =
    recipient !== null && config !== null
      ? await deps.hasConsent(propertyId, channel)
      : false;
  const suppressionReason =
    recipient !== null
      ? await deps.getSuppressionReason(recipient, channel)
      : null;

  // Would a cheaper check already block? If so, skip external/expensive work.
  const senderMissing =
    !config ||
    (channel === "SMS" && !config.smsFromNumber) ||
    (channel === "EMAIL" && (!config.supportEmail || !config.physicalAddress));
  const cheaperBlocks =
    !config ||
    !config.sendingEnabled ||
    senderMissing ||
    !recipient ||
    !hasConsentFact ||
    suppressionReason !== null;

  let dnc: DncResult | null = null;
  let dncError: string | null = null;
  let quietHours: DecisionFacts["quietHours"] = null;

  if (channel === "SMS" && !cheaperBlocks && recipient && config) {
    try {
      dnc = await deps.scrubDnc(recipient);
    } catch (error) {
      dncError = error instanceof Error ? error.message : "DNC provider error";
    }
    if (dnc?.onDnc) {
      await deps.onDncDetected(recipient, `national DNC via ${dnc.source}`);
    }
    const state = await deps.getPropertyState(propertyId);
    quietHours = evaluateQuietHours({
      state,
      now,
      startHour: config.quietHoursStart,
      endHour: config.quietHoursEnd,
    });
  }

  const since = new Date(now.getTime() - FREQUENCY_WINDOW_MS);
  const recentOutbound = cheaperBlocks
    ? 0
    : await deps.countRecentOutbound(propertyId, channel, since);

  return composeDecision({
    channel,
    recipient,
    config,
    hasConsent: hasConsentFact,
    suppressionReason,
    dnc: dnc ? { configured: dnc.configured, onDnc: dnc.onDnc, source: dnc.source } : null,
    dncError,
    quietHours,
    recentOutbound,
  });
}
