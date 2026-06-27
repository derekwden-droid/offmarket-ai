# OffMarket.AI — On-Call Notes

Incident-response companion to [`RUNBOOK.md`](./RUNBOOK.md). Scope: the live
production system at `offmarket-ai.vercel.app`.

---

## First principles

1. **When in doubt, hit the kill switch.** Flip `ComplianceConfig.sendingEnabled`
   to `false` (Compliance dashboard, or `UPDATE "ComplianceConfig" SET
   "sendingEnabled" = false;` in Supabase). It is always safe — outbound is
   fail-closed and nothing is lost; threads resume when re-enabled.
2. **Compliance incidents outrank availability.** A wrongful send (to a
   suppressed/DNC/opted-out recipient, or outside quiet hours) is more serious
   than the dashboard being down. Stop sending first, diagnose second.
3. **Never bypass the gate.** `sendOutreach` is the only outbound path. Do not
   add a second send path during an incident.

---

## Severity & response

| Sev | Examples | First move |
| --- | --- | --- |
| **SEV-1** | Messages sent to suppressed/opted-out/DNC recipients; sends outside quiet hours; STOP not suppressing; secret leaked | Kill switch OFF. Then page the build owner + notify the operator (legal exposure). |
| **SEV-2** | Deliverability collapse (`outreach.send.failed` spike), carrier filtering, opt-out rate spike, 10DLC campaign rejected | Pause affected campaign/threads; check provider + carrier status; review recent template changes. |
| **SEV-3** | Dashboard 5xx (`api.error`), Inngest jobs stuck, DB connection errors | Check Vercel + Supabase + Inngest status; consider rollback. |
| **SEV-4** | Cosmetic / a11y / single-record data issue | File a ticket; handle in normal flow. |

---

## Triage checklist

1. **Scope:** one recipient, one campaign, or global? Check the structured logs
   (filter by `event`) and Sentry.
2. **Recent change:** last deploy on `main`, last `ComplianceConfig` edit, last
   template/agent-config change.
3. **Dependencies up?** Supabase (DB), Vercel (app), Inngest (queue), Twilio/
   Telnyx (SMS), Resend (email), Anthropic (agent), DNC provider.
4. **Containment:** kill switch (global) or `Conversation.paused` (one thread).
5. **Comms:** for SEV-1/2 notify the operator; compliance incidents may need the
   attorney.

---

## Quick diagnostics

| Symptom | Likely cause | Check |
| --- | --- | --- |
| All sends blocked | kill switch OFF / missing consent / unconfigured provider | `ComplianceConfig.sendingEnabled`; gate decision in the send-gate tester |
| `outreach.send.failed` spike | provider outage / bad credentials / carrier filtering | provider status page; `outreach.carrier.filtered` events; rotate creds if auth errors |
| STOP not working | inbound webhook signature failing | `/api/inbound/sms` logs; Twilio/Telnyx signature config (`TELNYX_PUBLIC_KEY`, `INBOUND_SMS_WEBHOOK_URL`) |
| 5xx on dashboard | DB unreachable / unhandled error | `api.error` logs + Sentry; Supabase health; `/api/stats` returns `available:false` on DB outage by design |
| Jobs stuck "pending" | normal cold-start latency (~30–45s) or missing Inngest keys | Inngest dashboard; `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` set in Vercel |
| Data API exposed | RLS / grants regressed | run the RLS verification queries in RUNBOOK §4 |

---

## Escalation

- **Build owner (engineering):** deploys, rollbacks, code fixes.
- **Operator / co-founder:** vendor accounts, 10DLC, EIN, customer comms.
- **TCPA/telemarketing attorney:** any compliance incident (wrongful send,
  consent/DNC failure) before resuming outreach.

Record every SEV-1/2 with a short blameless write-up: timeline, impact (recipient
count), root cause, and the follow-up to prevent recurrence.
