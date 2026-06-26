/**
 * Agent prompt construction (pure — no I/O, unit-tested).
 *
 * Turns the persisted AgentConfig + property + conversation transcript into the
 * system instruction and a single user message for the LLM. The transcript is
 * rendered as a labelled block (rather than mapped to alternating roles) so it
 * is robust regardless of who spoke first — outreach always opens with an OUT
 * message, which would otherwise violate the user-first message constraint.
 */

export interface TranscriptLine {
  direction: "IN" | "OUT";
  body: string;
}

export interface AgentPromptInput {
  businessName: string;
  tone: string;
  objectives: string[];
  channel: "SMS" | "EMAIL";
  property: {
    ownerName?: string | null;
    address: string;
    city: string;
    state: string;
  };
  scriptTemplate: string;
  transcript: TranscriptLine[];
}

export interface AgentPrompt {
  system: string;
  user: string;
}

/** Replace {{ownerName}} / {{address}} / {{city}} / {{state}} tokens. */
export function renderTemplate(
  template: string,
  ctx: { ownerName?: string | null; address: string; city: string; state: string },
): string {
  return template
    .replaceAll("{{ownerName}}", ctx.ownerName ?? "there")
    .replaceAll("{{address}}", ctx.address)
    .replaceAll("{{city}}", ctx.city)
    .replaceAll("{{state}}", ctx.state);
}

export function buildAgentPrompt(input: AgentPromptInput): AgentPrompt {
  const lengthRule =
    input.channel === "SMS"
      ? "Keep replies under 320 characters (this is SMS). No links unless asked."
      : "Keep replies concise and skimmable (this is email).";

  const objectives =
    input.objectives.length > 0
      ? input.objectives.map((o) => `- ${o}`).join("\n")
      : "- Gauge whether the owner is open to selling.";

  const owner = input.property.ownerName ?? "the owner";

  const system = [
    `You are an outreach assistant for ${input.businessName}, a real-estate acquisition company.`,
    `You are messaging ${owner} about their property at ${input.property.address}, ${input.property.city}, ${input.property.state}.`,
    ``,
    `Tone: ${input.tone}. ${lengthRule}`,
    `Always identify the business. Be honest; never invent prices, offers, or facts you were not given.`,
    `If the person is not interested, acknowledge politely and propose state COLD. If they opt out, propose state OPTED_OUT and do not pursue.`,
    `If they show real selling interest or give qualifying detail, propose state QUALIFIED.`,
    ``,
    `Objectives:`,
    objectives,
    ``,
    `You must respond by calling the propose_reply tool with: the next message to send (reply),`,
    `the conversation's nextState, whether the lead is now qualified, and a one-line reasoning.`,
    `The reply you propose will be reviewed by a human before it is sent.`,
  ].join("\n");

  const opener = renderTemplate(input.scriptTemplate, input.property);

  const transcriptBlock =
    input.transcript.length > 0
      ? input.transcript
          .map((line) => `${line.direction === "IN" ? owner : "Us"}: ${line.body}`)
          .join("\n")
      : "(no messages yet)";

  const user = [
    `Opening script (already personalized):`,
    opener,
    ``,
    `Conversation so far:`,
    transcriptBlock,
    ``,
    `Propose the next reply and the resulting conversation state.`,
  ].join("\n");

  return { system, user };
}
