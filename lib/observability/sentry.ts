/**
 * Minimal Sentry error reporting (Phase 6 observability).
 *
 * Posts exceptions to Sentry's "store" endpoint over plain HTTP, parsing the
 * standard DSN — no `@sentry/*` SDK dependency, matching the project convention
 * of calling vendor REST APIs directly (see lib/agent/llm.ts). This keeps the
 * bundle small and avoids the SDK's framework instrumentation.
 *
 * Fail-OPEN: if SENTRY_DSN is unset or malformed, or the network call fails,
 * capture silently does nothing. Error reporting must never break a request.
 *
 * Config: SENTRY_DSN, optional SENTRY_ENVIRONMENT (defaults to VERCEL_ENV or
 * NODE_ENV), optional SENTRY_RELEASE (defaults to VERCEL_GIT_COMMIT_SHA).
 */

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

/** Parse a Sentry DSN into the ingest endpoint + public key. Null when invalid. */
export function parseSentryDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!publicKey || !projectId) return null;
    const host = url.host;
    const protocol = url.protocol || "https:";
    return {
      endpoint: `${protocol}//${host}/api/${projectId}/store/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

function environment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

function release(): string | undefined {
  return process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
}

/** Whether error reporting is configured (a valid DSN is present). */
export function isSentryEnabled(): boolean {
  return parseSentryDsn(process.env.SENTRY_DSN) !== null;
}

/**
 * Report an exception to Sentry. Fire-and-forget and fail-open: callers should
 * NOT await this on the hot path — `void captureException(err, {...})`.
 */
export async function captureException(
  error: unknown,
  context: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  const dsn = parseSentryDsn(process.env.SENTRY_DSN);
  if (!dsn) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const tags: Record<string, string> = {};
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length <= 200) {
      tags[key] = value;
    } else {
      extra[key] = value;
    }
  }

  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    environment: environment(),
    release: release(),
    tags,
    extra,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack ? { frames: [{ function: err.stack.split("\n")[1]?.trim() ?? "unknown" }] } : undefined,
        },
      ],
    },
  };

  const auth =
    `Sentry sentry_version=7, sentry_client=offmarket-rest/1.0, ` +
    `sentry_key=${dsn.publicKey}`;

  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // Fail open — never let error reporting throw.
  }
}
