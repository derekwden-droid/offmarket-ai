/**
 * Inbound keyword classification (pure).
 *
 * Carriers recognize a standard set of opt-out / help / opt-in keywords. We map
 * an inbound body to one intent; the first word (case-insensitive, punctuation
 * stripped) decides. Anything else is a normal conversational REPLY handed to
 * the Phase 5 agent.
 */

export type InboundIntent = "STOP" | "HELP" | "START" | "REPLY";

const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "OPTOUT",
  "REVOKE",
]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES", "OPTIN"]);

export function classifyInbound(body: string): InboundIntent {
  const firstWord = body
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  if (!firstWord) return "REPLY";
  if (STOP_WORDS.has(firstWord)) return "STOP";
  if (HELP_WORDS.has(firstWord)) return "HELP";
  if (START_WORDS.has(firstWord)) return "START";
  return "REPLY";
}
