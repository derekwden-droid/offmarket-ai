/**
 * Observability entry point (Phase 6).
 *
 * Re-exports the structured logger and Sentry capture, and defines the small set
 * of stable ALERT EVENTS the operator dashboards/alerts key off:
 *
 *   - outreach.send.ok        a marketing message was dispatched
 *   - outreach.send.failed    the provider returned an error / threw (deliverability)
 *   - outreach.send.blocked   the compliance gate or pause stopped a send
 *   - outreach.carrier.filtered  a provider/status callback reported carrier filtering
 *   - optout.recorded         an inbound STOP / unsubscribe suppressed a recipient
 *   - api.error               an unhandled 5xx in a route handler
 *
 * Alerts (see RUNBOOK.md "Alerting") are configured downstream on these event
 * names: e.g. page when `outreach.send.failed` rate > X/5m, or when the ratio of
 * `optout.recorded` to `outreach.send.ok` crosses the opt-out threshold.
 */

import { log } from "@/lib/observability/logger";
import { captureException } from "@/lib/observability/sentry";

export { log } from "@/lib/observability/logger";
export {
  captureException,
  isSentryEnabled,
  parseSentryDsn,
} from "@/lib/observability/sentry";

export type AlertChannel = "SMS" | "EMAIL";

/** A marketing message was successfully dispatched to a provider. */
export function recordSendOk(fields: {
  channel: AlertChannel;
  providerSid?: string;
  conversationId?: string | null;
}): void {
  log.info("outreach.send.ok", {
    channel: fields.channel,
    providerSid: fields.providerSid,
    conversationId: fields.conversationId ?? undefined,
  });
}

/**
 * A send failed at the provider (threw or returned an error). This is the
 * primary deliverability signal — alert on its rate. Also reported to Sentry.
 */
export function recordSendFailed(
  error: unknown,
  fields: { channel: AlertChannel; conversationId?: string | null },
): void {
  const message = error instanceof Error ? error.message : String(error);
  log.error("outreach.send.failed", {
    channel: fields.channel,
    conversationId: fields.conversationId ?? undefined,
    error: message,
  });
  // Carrier filtering frequently surfaces as a provider error mentioning the
  // carrier (e.g. Twilio 30007/30008, "blocked", "filtered"). Tag it so the
  // carrier-filtering alert can fire distinctly from generic send failures.
  if (/filter|block|carrier|30007|30008|21610/i.test(message)) {
    log.warn("outreach.carrier.filtered", {
      channel: fields.channel,
      conversationId: fields.conversationId ?? undefined,
      error: message,
    });
  }
  void captureException(error, {
    where: "outreach.send",
    channel: fields.channel,
    conversationId: fields.conversationId ?? null,
  });
}

/** The compliance gate / pause blocked an outbound send. */
export function recordSendBlocked(fields: {
  channel: AlertChannel;
  reason: string;
  conversationId?: string | null;
}): void {
  log.warn("outreach.send.blocked", {
    channel: fields.channel,
    reason: fields.reason,
    conversationId: fields.conversationId ?? undefined,
  });
}

/** An inbound STOP or one-click unsubscribe suppressed a recipient. */
export function recordOptOut(fields: {
  channel: AlertChannel;
  reason: string;
  source: string;
}): void {
  log.warn("optout.recorded", {
    channel: fields.channel,
    reason: fields.reason,
    source: fields.source,
  });
}

/** An unhandled 5xx surfaced in a route handler. */
export function recordApiError(error: unknown, fields: { code: string }): void {
  const message = error instanceof Error ? error.message : String(error);
  log.error("api.error", { code: fields.code, error: message });
  void captureException(error, { where: "api.route", code: fields.code });
}
