import type { Channel, SuppressionReason } from "@prisma/client";

/**
 * Pure compliance decision core.
 *
 * The ordered, fail-closed logic of the send-time gate lives here with NO I/O
 * (no Prisma, no providers, no `server-only`) so it unit-tests directly. The
 * server-side `gate.ts` gathers the facts and delegates the verdict to
 * `composeDecision`, keeping the ordering rules in exactly one place.
 */

export type ComplianceBlockReason =
  | "CONFIG_MISSING"
  | "SENDING_DISABLED"
  | "SENDER_NOT_CONFIGURED"
  | "INVALID_RECIPIENT"
  | "NO_CONSENT"
  | "SUPPRESSED"
  | "DNC_NOT_CONFIGURED"
  | "ON_DNC"
  | "DNC_ERROR"
  | "QUIET_HOURS"
  | "FREQUENCY_CAP";

export interface ComplianceCheck {
  name: string;
  passed: boolean;
  note?: string;
}

export interface ComplianceDecision {
  allowed: boolean;
  reason: ComplianceBlockReason | null;
  detail: string;
  channel: Channel;
  recipient: string | null;
  checks: ComplianceCheck[];
}

/** Subset of ComplianceConfig the decision needs. */
export interface GateConfig {
  sendingEnabled: boolean;
  smsFromNumber: string | null;
  supportEmail: string;
  physicalAddress: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  dailyCapPerRecipient: number;
}

export interface DncFact {
  configured: boolean;
  onDnc: boolean;
  source: string;
}

export interface QuietHoursFact {
  allowed: boolean;
  timeZone: string | null;
  localHour: number | null;
}

export interface DecisionFacts {
  channel: Channel;
  /** Normalized recipient, or null when it could not be keyed. */
  recipient: string | null;
  config: GateConfig | null;
  hasConsent: boolean;
  suppressionReason: SuppressionReason | null;
  /** SMS only: DNC scrub result, or null if not reached. */
  dnc: DncFact | null;
  /** SMS only: message from a DNC transport failure, else null. */
  dncError: string | null;
  /** SMS only: quiet-hours evaluation, or null if not reached. */
  quietHours: QuietHoursFact | null;
  /** Outbound messages to this recipient in the rolling 24h window. */
  recentOutbound: number;
}

function block(
  facts: DecisionFacts,
  checks: ComplianceCheck[],
  reason: ComplianceBlockReason,
  detail: string,
): ComplianceDecision {
  return {
    allowed: false,
    reason,
    detail,
    channel: facts.channel,
    recipient: facts.recipient,
    checks,
  };
}

/** Evaluate the ordered, fail-closed compliance rules over already-gathered facts. */
export function composeDecision(facts: DecisionFacts): ComplianceDecision {
  const checks: ComplianceCheck[] = [];
  const { config, channel } = facts;

  // 1. Configuration present.
  if (!config) return block(facts, checks, "CONFIG_MISSING", "No ComplianceConfig is set.");
  checks.push({ name: "config", passed: true });

  // 2. Global kill switch.
  if (!config.sendingEnabled) {
    return block(facts, checks, "SENDING_DISABLED", "Global sending is disabled (kill switch).");
  }
  checks.push({ name: "kill-switch", passed: true });

  // 3. Sender identity for the channel.
  if (channel === "SMS" && !config.smsFromNumber) {
    return block(facts, checks, "SENDER_NOT_CONFIGURED", "No two-way SMS number configured.");
  }
  if (channel === "EMAIL" && (!config.supportEmail || !config.physicalAddress)) {
    return block(facts, checks, "SENDER_NOT_CONFIGURED", "Email sender identity / postal address missing (CAN-SPAM).");
  }
  checks.push({ name: "sender-identity", passed: true });

  // 4. Keyable recipient.
  if (!facts.recipient) {
    return block(facts, checks, "INVALID_RECIPIENT", "Recipient is not a valid phone/email for the channel.");
  }
  checks.push({ name: "recipient", passed: true, note: facts.recipient });

  // 5. Consent (unbypassable).
  if (!facts.hasConsent) {
    return block(facts, checks, "NO_CONSENT", "No consent record for this property + channel.");
  }
  checks.push({ name: "consent", passed: true });

  // 6. Suppression ledger.
  if (facts.suppressionReason) {
    return block(facts, checks, "SUPPRESSED", `Recipient is suppressed (${facts.suppressionReason}).`);
  }
  checks.push({ name: "suppression", passed: true });

  // 7 + 8: SMS-only DNC + quiet hours (telemarketing rules).
  if (channel === "SMS") {
    if (facts.dncError) {
      return block(facts, checks, "DNC_ERROR", `DNC scrub failed; blocking. ${facts.dncError}`);
    }
    if (!facts.dnc || !facts.dnc.configured) {
      return block(facts, checks, "DNC_NOT_CONFIGURED", "DNC provider not configured; blocking (fail closed).");
    }
    if (facts.dnc.onDnc) {
      return block(facts, checks, "ON_DNC", `Recipient is on the national DNC list (${facts.dnc.source}).`);
    }
    checks.push({ name: "dnc", passed: true, note: facts.dnc.source });

    const quiet = facts.quietHours;
    if (!quiet || !quiet.allowed) {
      const why = quiet?.timeZone
        ? `local hour ${quiet.localHour} outside ${config.quietHoursStart}:00–${config.quietHoursEnd}:00 (${quiet.timeZone})`
        : "could not resolve recipient timezone";
      return block(facts, checks, "QUIET_HOURS", `Quiet hours: ${why}.`);
    }
    checks.push({ name: "quiet-hours", passed: true, note: quiet.timeZone ?? undefined });
  }

  // 9. Frequency cap (rolling 24h).
  if (facts.recentOutbound >= config.dailyCapPerRecipient) {
    return block(facts, checks, "FREQUENCY_CAP", `Frequency cap reached (${facts.recentOutbound}/${config.dailyCapPerRecipient} in 24h).`);
  }
  checks.push({ name: "frequency-cap", passed: true, note: `${facts.recentOutbound}/${config.dailyCapPerRecipient}` });

  return {
    allowed: true,
    reason: null,
    detail: "All compliance checks passed.",
    channel,
    recipient: facts.recipient,
    checks,
  };
}
