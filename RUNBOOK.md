# OffMarket.AI — Operations Runbook

Operational reference for the live system. Pairs with [`ON-CALL.md`](./ON-CALL.md)
(rotation + escalation) and the build/launch schedule. Everything outbound is
**fail-closed** and gated by the global kill switch, which defaults **OFF**.

---

## 1. System map

| Layer | What | Where |
| --- | --- | --- |
| App | Next.js 15 (App Router) | Vercel project `offmarket-ai`, prod alias `offmarket-ai.vercel.app` |
| Source of truth | GitHub `main` → auto-deploys to Vercel production | `derekwden-droid/offmarket-ai` |
| Database | Supabase Postgres (us-east-1) via Supavisor pooler (6543); migrations via direct 5432 | Supabase project `qioauwknvagxjinsxseu` |
| Queue | Inngest durable workers (skip-trace, county cron, agent draft reply) | `/api/inngest` |
| SMS | Twilio / Telnyx behind the compliance gate | `lib/providers/sms.ts` |
| Email | Resend, CAN-SPAM footer + one-click unsubscribe | `lib/providers/email.ts` |
| Compliance gate | `evaluateSend` — consent → suppression → DNC → quiet hours → caps → sender id → kill switch | `lib/compliance/gate.ts` |

---

## 2. The kill switch (most important control)

A single `ComplianceConfig.sendingEnabled` flag gates **all** outbound marketing.
It defaults `false`.

- **Turn ON:** Compliance dashboard → toggle "Sending enabled". Only after the
  Go/No-Go gate (EIN, 10DLC VERIFIED, attorney sign-off) is cleared.
- **Emergency OFF (halt everything):** toggle it off in the Compliance dashboard.
  Effect is immediate — `evaluateSend` blocks the next dispatch. No deploy needed.
- **Pause one thread:** set `Conversation.paused = true` (per-conversation pause)
  from the Outreach dashboard.

If the dashboard is unreachable, flip it directly in Supabase:
`UPDATE "ComplianceConfig" SET "sendingEnabled" = false;`

---

## 3. Alerting (Phase 6 observability)

Structured JSON logs (one object per line) are emitted to Vercel's log stream.
Alerts key off the stable `event` field — never free text. Wire a Vercel Log
Drain (Datadog / Logtail / Sentry) and alert on these:

| Event | Meaning | Suggested alert |
| --- | --- | --- |
| `outreach.send.failed` | provider threw / returned error | page if > 5 in 5 min (deliverability) |
| `outreach.carrier.filtered` | error matched carrier-filter patterns (30007/30008/21610/"blocked") | page on any spike |
| `optout.recorded` | inbound STOP or one-click unsubscribe | alert if opt-out:send ratio > 3% |
| `outreach.send.blocked` | gate/pause stopped a send | informational; investigate sustained spikes |
| `api.error` | unhandled 5xx in a route handler | page; also lands in Sentry |

Error tracking: set `SENTRY_DSN` to forward `api.error` and send failures to
Sentry (no SDK; direct REST, fail-open). Unset = silent no-op. Tune verbosity
with `LOG_LEVEL` (debug|info|warn|error).

---

## 4. Common procedures

### Apply a database migration
```bash
# Uses DIRECT_URL (port 5432). Never run migrations through the pooler.
npx prisma migrate deploy
```
Pending as of Phase 6 cutover: `*_phase4_compliance_backbone`,
`*_phase5_outreach_engine`, `*_phase6_rls_hardening`. Apply in order. The Phase 6
migration is idempotent and may also be pasted into the Supabase SQL editor.

### Verify RLS is locked down (Phase 6)
```sql
SELECT tablename, rowsecurity, forcerowsecurity
  FROM pg_tables WHERE schemaname = 'public';        -- expect true/true per app table
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon','authenticated');  -- expect 0 rows
```
The app connects with the `postgres` role (BYPASSRLS), so the Data API roles
(`anon`/`authenticated`) being denied does not affect runtime. Consider also
disabling the Supabase Data API entirely (Project Settings → API) since this app
never uses PostgREST.

### Rotate a leaked secret
1. Revoke at the provider (GitHub PAT, Twilio/Telnyx, Resend, Anthropic, etc.).
2. Set the new value in Vercel (Production + Preview) → redeploy.
3. Secrets live only in env; `.gitignore` blocks every `.env*` except
   `.env.example`. Confirm none are committed: `git grep -nE "sk-|ghp_|AC[0-9a-f]{32}"`.

### Replay / debug an Inngest job
Inngest dashboard → Functions → select run → inspect steps / replay. Each durable
step is a separate Inngest↔Vercel round trip (~30–45s wall-clock on cold start);
"pending" in the UI during that window is normal.

---

## 5. Rate limiting (public routes)

The self-authenticating routes (`/api/scrape`, `/api/inbound/*`,
`/api/unsubscribe`, `/api/inngest`) are rate-limited per client IP in
`middleware.ts`. Defaults: 60 req / 60 s / IP. Tune via `RATE_LIMIT_MAX`,
`RATE_LIMIT_WINDOW_MS`, or disable with `RATE_LIMIT_ENABLED=false`. The limiter
is in-memory per Edge isolate (best-effort burst protection); the signature/HMAC
checks inside each route remain the real authentication. For strict global
limits, move the counter to a shared store (Upstash/Redis) — see `lib/rate-limit.ts`.

---

## 6. Deploy / rollback

- **Deploy:** merge to `main`; Vercel builds and promotes automatically. Always
  push a branch first and confirm the **preview build is green** before merging —
  the local sandbox cannot complete a full `next build`, so the preview is the
  authoritative type/build gate.
- **Rollback:** Vercel → Deployments → pick the last good production deployment →
  "Promote to Production". DB migrations do not auto-roll-back; assess schema
  compatibility before promoting an older build.
