import "server-only";

/**
 * Do-Not-Call scrubbing provider.
 *
 * Fail-closed by design (Phase 4 GATE): when no provider is configured the
 * send-time gate must block, never silently allow an unscrubbed number. This
 * module therefore reports `configured: false` rather than guessing, and throws
 * on transport failure so the gate's try/catch blocks the send.
 *
 * Configure with:
 *   DNC_API_URL   — provider scrub endpoint (POST {phone} -> {on_dnc|listed})
 *   DNC_API_KEY   — bearer token
 *
 * The national list is the provider's responsibility; the internal list is the
 * Suppression ledger (reason DNC|MANUAL) checked separately in the gate.
 */

export interface DncResult {
  /** False when no provider credentials are present (gate blocks, fail-closed). */
  configured: boolean;
  /** True when the number matches the national Do-Not-Call registry. */
  onDnc: boolean;
  /** Where the determination came from (provider host or "unconfigured"). */
  source: string;
}

interface DncProviderResponse {
  on_dnc?: boolean;
  listed?: boolean;
  result?: { on_dnc?: boolean; listed?: boolean };
}

/** Scrub a normalized E.164 phone against the national DNC registry. */
export async function scrubNationalDnc(phoneE164: string): Promise<DncResult> {
  const url = process.env.DNC_API_URL;
  const key = process.env.DNC_API_KEY;

  if (!url || !key) {
    return { configured: false, onDnc: false, source: "unconfigured" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ phone: phoneE164 }),
    // Never cache a compliance determination.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `DNC provider returned ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as DncProviderResponse;
  const onDnc = Boolean(
    data.on_dnc ?? data.listed ?? data.result?.on_dnc ?? data.result?.listed,
  );

  let host = "dnc-provider";
  try {
    host = new URL(url).host;
  } catch {
    /* keep fallback label */
  }

  return { configured: true, onDnc, source: host };
}
