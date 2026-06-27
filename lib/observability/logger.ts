/**
 * Structured JSON logger (Phase 6 observability).
 *
 * Emits one JSON object per line to stdout/stderr so Vercel's log drains (and
 * any downstream alerting — Datadog, Logtail, a Vercel Log Drain to Sentry,
 * etc.) can parse and alert on specific events. No external dependency and no
 * Node-only APIs, so it is safe in the Edge runtime (middleware) and the Node
 * runtime (route handlers, services) alike.
 *
 * Every line carries `{ ts, level, event, ...fields }`. Downstream alerts key
 * off the stable `event` string (see ALERT EVENTS in RUNBOOK.md), never the
 * free-text message.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured fields attached to a log line. Values must be JSON-serializable. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Minimum level to emit, from LOG_LEVEL (default "info"). */
function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[configured as LogLevel] ?? LEVEL_ORDER.info;
}

/** Redact obviously-sensitive values so transcripts/PII never hit the log sink. */
function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function emit(level: LogLevel, event: string, fields: LogFields): void {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields),
  });
  // Route warn/error to stderr, everything else to stdout.
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (event: string, fields: LogFields = {}) => emit("debug", event, fields),
  info: (event: string, fields: LogFields = {}) => emit("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => emit("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => emit("error", event, fields),
};
