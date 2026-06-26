import "server-only";
import { z } from "zod";
import type { ConversationState } from "@prisma/client";
import { buildAgentPrompt, type AgentPromptInput } from "@/lib/agent/prompt";

/**
 * Anthropic Claude agent client (Phase 5).
 *
 * Produces a STRUCTURED proposal — next reply, next conversation state, a
 * qualified flag, and one-line reasoning — via tool-use, so the output is always
 * a well-formed object (never free-form prose we have to parse heuristically).
 * Draft-for-approval: this only *proposes*; a human approves before anything is
 * sent, and the approved send still passes the compliance gate.
 *
 * Uses the REST API directly (no SDK dependency). Fail-closed: throws
 * `AgentNotConfiguredError` when ANTHROPIC_API_KEY is absent.
 *
 * Config: ANTHROPIC_API_KEY, AGENT_MODEL (default claude-sonnet-4-6).
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";

const CONVERSATION_STATES = [
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "QUALIFIED",
  "COLD",
  "OPTED_OUT",
] as const;

export class AgentNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentNotConfiguredError";
  }
}

export interface AgentProposal {
  reply: string;
  nextState: ConversationState;
  qualified: boolean;
  reasoning: string;
}

const proposalSchema = z.object({
  reply: z.string().min(1).max(1500),
  nextState: z.enum(CONVERSATION_STATES),
  qualified: z.boolean(),
  reasoning: z.string().max(500),
});

const PROPOSE_TOOL = {
  name: "propose_reply",
  description:
    "Propose the next outreach message to send and the resulting conversation state.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "The next message to send to the lead.",
      },
      nextState: {
        type: "string",
        enum: CONVERSATION_STATES,
        description: "The conversation state after this reply.",
      },
      qualified: {
        type: "boolean",
        description: "True if the lead is now a qualified, motivated seller.",
      },
      reasoning: {
        type: "string",
        description: "One short sentence explaining the decision.",
      },
    },
    required: ["reply", "nextState", "qualified", "reasoning"],
  },
} as const;

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  error?: { message?: string };
}

/**
 * Generate a structured reply proposal from the conversation context. Throws
 * when the model is unconfigured (fail closed) or returns no usable tool call.
 */
export async function generateAgentProposal(
  input: AgentPromptInput,
): Promise<AgentProposal> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AgentNotConfiguredError("ANTHROPIC_API_KEY is not configured.");
  }
  const model = process.env.AGENT_MODEL ?? DEFAULT_MODEL;
  const prompt = buildAgentPrompt(input);

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      tools: [PROPOSE_TOOL],
      tool_choice: { type: "tool", name: "propose_reply" },
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as AnthropicResponse;
  if (!response.ok) {
    throw new Error(
      `Anthropic request failed (${response.status}): ${data.error?.message ?? "unknown error"}`,
    );
  }

  const toolUse = data.content?.find(
    (block) => block.type === "tool_use" && block.name === "propose_reply",
  );
  if (!toolUse || toolUse.input === undefined) {
    throw new Error("Anthropic returned no propose_reply tool call.");
  }

  const parsed = proposalSchema.parse(toolUse.input);
  return {
    reply: parsed.reply,
    nextState: parsed.nextState,
    qualified: parsed.qualified,
    reasoning: parsed.reasoning,
  };
}
