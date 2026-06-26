import "server-only";
import type { Channel, SuppressionReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRecipient } from "@/lib/compliance/normalize";

/**
 * Suppression ledger service — the hard block enforced at send time.
 *
 * A row keyed on the normalized (value, channel) blocks every send to that
 * recipient, regardless of consent. STOP writes land here within milliseconds
 * of the inbound webhook so opt-outs take effect "within seconds" per the
 * acceptance gate. All reads/writes normalize first so formatting never lets a
 * suppressed recipient slip through.
 */

export interface AddSuppressionInput {
  value: string;
  channel: Channel;
  reason: SuppressionReason;
  detail?: string;
}

export interface SuppressionRow {
  id: string;
  value: string;
  channel: Channel;
  reason: SuppressionReason;
  detail: string | null;
  createdAt: Date;
}

/**
 * Add (or update) a suppression. Idempotent on the unique (value, channel):
 * re-sending STOP, or layering a DNC over an existing entry, updates the reason
 * and detail rather than erroring. Returns null when the value cannot be
 * normalized for the channel (nothing safe to key on).
 */
export async function addSuppression(
  input: AddSuppressionInput,
): Promise<SuppressionRow | null> {
  const value = normalizeRecipient(input.value, input.channel);
  if (!value) return null;

  return prisma.suppression.upsert({
    where: { suppression_identity: { value, channel: input.channel } },
    create: {
      value,
      channel: input.channel,
      reason: input.reason,
      detail: input.detail ?? null,
    },
    update: { reason: input.reason, detail: input.detail ?? null },
  });
}

/** True when the recipient is suppressed on the channel. Normalizes first. */
export async function isSuppressed(
  value: string,
  channel: Channel,
): Promise<boolean> {
  const normalized = normalizeRecipient(value, channel);
  if (!normalized) return true; // un-keyable recipient -> fail closed (block).
  const row = await prisma.suppression.findUnique({
    where: { suppression_identity: { value: normalized, channel } },
    select: { id: true },
  });
  return row !== null;
}

/** Fetch the suppression row for a recipient, or null. */
export async function getSuppression(
  value: string,
  channel: Channel,
): Promise<SuppressionRow | null> {
  const normalized = normalizeRecipient(value, channel);
  if (!normalized) return null;
  return prisma.suppression.findUnique({
    where: { suppression_identity: { value: normalized, channel } },
  });
}

/**
 * Remove a suppression (used by START/UNSTOP to re-subscribe a recipient).
 * Returns true when a row was deleted. Safe to call when none exists.
 */
export async function removeSuppression(
  value: string,
  channel: Channel,
): Promise<boolean> {
  const normalized = normalizeRecipient(value, channel);
  if (!normalized) return false;
  const result = await prisma.suppression.deleteMany({
    where: { value: normalized, channel },
  });
  return result.count > 0;
}

/** Most recent suppressions for the ledger view. */
export async function listSuppressions(limit = 100): Promise<SuppressionRow[]> {
  return prisma.suppression.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
