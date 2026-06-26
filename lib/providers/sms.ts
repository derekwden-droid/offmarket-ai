import "server-only";

/**
 * Provider-agnostic SMS sender (Twilio or Telnyx).
 *
 * Phase 4 uses this only for compliance-mandated replies — the HELP auto-
 * response and the STOP opt-out confirmation — which are exempt from the
 * outbound marketing gate. Phase 5's outreach engine reuses the same sender
 * *behind* the gate for marketing sends.
 *
 * Fail-closed: throws `SmsNotConfiguredError` when credentials are absent, so a
 * misconfigured deployment never appears to "send" silently.
 *
 * Config (pick one provider via SMS_PROVIDER, or it is inferred from creds):
 *   Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   Telnyx: TELNYX_API_KEY, (optional) TELNYX_MESSAGING_PROFILE_ID
 */

export type SmsProviderName = "twilio" | "telnyx";

export class SmsNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsNotConfiguredError";
  }
}

export interface SendSmsInput {
  to: string;
  from: string;
  body: string;
}

export interface SendSmsResult {
  /** Provider message id (Twilio SID / Telnyx id), for the Message transcript. */
  providerSid: string;
  provider: SmsProviderName;
}

/** Determine which provider to use from env, preferring an explicit override. */
export function resolveSmsProvider(): SmsProviderName | null {
  const explicit = process.env.SMS_PROVIDER?.toLowerCase();
  if (explicit === "twilio" || explicit === "telnyx") return explicit;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return "twilio";
  }
  if (process.env.TELNYX_API_KEY) return "telnyx";
  return null;
}

async function sendViaTwilio(input: SendSmsInput): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new SmsNotConfiguredError("Twilio credentials are not configured.");
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({
    To: input.to,
    From: input.from,
    Body: input.body,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const data = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok || !data.sid) {
    throw new Error(
      `Twilio send failed (${response.status}): ${data.message ?? "unknown error"}`,
    );
  }
  return { providerSid: data.sid, provider: "twilio" };
}

async function sendViaTelnyx(input: SendSmsInput): Promise<SendSmsResult> {
  const key = process.env.TELNYX_API_KEY;
  if (!key) {
    throw new SmsNotConfiguredError("Telnyx API key is not configured.");
  }

  const body: Record<string, string> = {
    from: input.from,
    to: input.to,
    text: input.body,
  };
  const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  if (profileId) body.messaging_profile_id = profileId;

  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    data?: { id?: string };
    errors?: Array<{ detail?: string }>;
  };
  if (!response.ok || !data.data?.id) {
    const detail = data.errors?.[0]?.detail ?? "unknown error";
    throw new Error(`Telnyx send failed (${response.status}): ${detail}`);
  }
  return { providerSid: data.data.id, provider: "telnyx" };
}

/** Send one SMS via the configured provider. Throws when none is configured. */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const provider = resolveSmsProvider();
  if (!provider) {
    throw new SmsNotConfiguredError(
      "No SMS provider configured (set SMS_PROVIDER + TWILIO_* or TELNYX_*).",
    );
  }
  return provider === "twilio" ? sendViaTwilio(input) : sendViaTelnyx(input);
}
