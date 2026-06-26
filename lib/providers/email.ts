import "server-only";

/**
 * Transactional/outreach email via Resend (Phase 5).
 *
 * Fail-closed: throws `EmailNotConfiguredError` when RESEND_API_KEY is absent so
 * a misconfigured deployment never appears to send. CAN-SPAM requires a physical
 * postal address and a working unsubscribe in every marketing email, so the
 * footer helpers below are always appended by the outreach service.
 *
 * Config: RESEND_API_KEY, EMAIL_FROM (e.g. "OffMarket <outreach@mail.offmarket.ai>").
 */

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export interface SendEmailResult {
  providerSid: string;
}

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape user/content text for safe HTML interpolation. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => escapeMap[c]);
}

/**
 * CAN-SPAM compliant footer. Includes the sending business name, its physical
 * postal address, and a one-click unsubscribe link wired to the Suppression
 * ledger. Returned as both HTML and plain text.
 */
export function canSpamFooter(args: {
  businessName: string;
  physicalAddress: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const { businessName, physicalAddress, unsubscribeUrl } = args;
  const html =
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />` +
    `<p style="font-size:12px;color:#6b7280;line-height:1.5">` +
    `${escapeHtml(businessName)}<br/>${escapeHtml(physicalAddress)}<br/>` +
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a> from these emails.` +
    `</p>`;
  const text =
    `\n\n--\n${businessName}\n${physicalAddress}\n` +
    `Unsubscribe: ${unsubscribeUrl}`;
  return { html, text };
}

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

/** Send one email via Resend. Throws when unconfigured (fail closed). */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new EmailNotConfiguredError("RESEND_API_KEY is not configured.");
  }
  const from = input.from ?? process.env.EMAIL_FROM;
  if (!from) {
    throw new EmailNotConfiguredError("EMAIL_FROM is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as ResendResponse;
  if (!response.ok || !data.id) {
    throw new Error(
      `Resend send failed (${response.status}): ${data.message ?? data.name ?? "unknown error"}`,
    );
  }
  return { providerSid: data.id };
}
