import type { Channel } from "@prisma/client";

/**
 * Recipient normalization.
 *
 * Suppression, consent, and frequency-cap checks key on a recipient identity,
 * so that identity must be computed the same way everywhere or a STOP from
 * "+1 (305) 555-1234" would not block a send to "3055551234". Every read and
 * write of a recipient value passes through here first.
 */

/**
 * Normalize a phone number to best-effort E.164 (US-centric).
 *
 * - Strips all formatting; keeps a leading "+".
 * - 10 digits        -> +1XXXXXXXXXX
 * - 11 digits, "1.." -> +1XXXXXXXXXX
 * - already "+.."    -> "+" + digits
 * - otherwise        -> "+" + digits (caller decides if it is plausible)
 *
 * Returns null when there are too few digits to be a real number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 7) return null;

  if (!hadPlus) {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  return `+${digits}`;
}

/** Normalize an email: trim + lowercase. Returns null when not email-shaped. */
export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  // Deliberately permissive — the strict check lives in the Zod schema; here we
  // only guarantee a stable key. Must contain one "@" with text either side.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

/**
 * Normalize a recipient for the given channel. Returns null when the value is
 * not a plausible identity for that channel — callers treat null as a hard
 * block (we cannot safely key compliance on garbage input).
 */
export function normalizeRecipient(
  value: string,
  channel: Channel,
): string | null {
  return channel === "SMS" ? normalizePhone(value) : normalizeEmail(value);
}
