import { z } from "zod";

/**
 * Zod schemas shared by API route handlers and (optionally) client forms.
 * Keeping validation here guarantees the server and any future client wiring
 * agree on the exact request contract.
 *
 * Phase 5 adds the outreach contracts (start outreach, approve draft) to the
 * Phase 1–4 schemas.
 */

/** A single scraped property candidate accepted by POST /api/scrape. */
export const scrapePropertyInput = z.object({
  address: z.string().min(1, "address is required").max(200),
  city: z.string().min(1, "city is required").max(120),
  state: z
    .string()
    .length(2, "state must be a 2-letter code")
    .transform((value) => value.toUpperCase()),
  zip: z.string().min(3, "zip is required").max(12),
  propertyType: z.string().min(1, "propertyType is required").max(60),
  zoning: z.string().max(60).optional(),
  scrapeSource: z.string().min(1, "scrapeSource is required").max(80),
});

export const scrapeRequestSchema = z.object({
  properties: z
    .array(scrapePropertyInput)
    .min(1, "at least one property is required")
    .max(500, "a single batch is limited to 500 properties"),
  listPackageId: z.string().uuid().optional(),
});

export const skipTraceRequestSchema = z.object({
  propertyIds: z
    .array(z.string().uuid())
    .min(1, "at least one propertyId is required")
    .max(500, "a single batch is limited to 500 ids"),
  concurrency: z.number().int().min(1).max(20).optional(),
});

/** Outreach channels mirror the Prisma `Channel` enum (SMS | EMAIL). */
export const channelSchema = z.enum(["SMS", "EMAIL"]);

/**
 * Tunable thresholds for the outreach agent. Persisted as JSON on AgentConfig
 * but validated to a strict shape so the saved config is always well-formed.
 */
export const agentThresholdsSchema = z.object({
  temperature: z.number().min(0).max(1),
  persistence: z.number().int().min(1).max(5),
  dailyCap: z.number().int().min(1).max(500),
});

/** Request body for POST /api/agent-config. */
export const agentConfigSchema = z.object({
  tone: z.string().min(1, "tone is required").max(40),
  objectives: z
    .array(z.string().min(1).max(60))
    .max(20, "at most 20 objectives")
    .default([]),
  channels: z
    .array(channelSchema)
    .min(1, "enable at least one channel")
    .max(2),
  scriptTemplate: z
    .string()
    .min(1, "scriptTemplate is required")
    .max(2000, "scriptTemplate is limited to 2000 characters"),
  thresholds: agentThresholdsSchema,
});

/** Query for the licensed-provider pull triggered from the Scrape UI. */
export const scrapeIngestQuerySchema = z.object({
  state: z.string().max(40).optional(),
  propertyType: z.string().max(60).optional(),
  source: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Phase 4 — Compliance backbone
// ---------------------------------------------------------------------------

/** Suppression reasons mirror the Prisma `SuppressionReason` enum. */
export const suppressionReasonSchema = z.enum([
  "STOP",
  "DNC",
  "BOUNCE",
  "MANUAL",
]);

/**
 * Record of prior express written consent for a property + channel.
 * `consentTextVersion` is optional on the wire — when omitted the service
 * stamps the version currently configured in ComplianceConfig so the stored
 * record always points at a real, attorney-reviewed consent string.
 */
export const consentRecordSchema = z.object({
  propertyId: z.string().uuid(),
  channel: channelSchema,
  source: z.string().min(1, "source is required").max(120),
  consentTextVersion: z.string().min(1).max(40).optional(),
  ipAddress: z.string().max(45).optional(),
});

/** Manual suppression entry (operator-added DNC/STOP/MANUAL/BOUNCE). */
export const manualSuppressionSchema = z.object({
  value: z.string().min(3, "value is required").max(160),
  channel: channelSchema,
  reason: suppressionReasonSchema,
  detail: z.string().max(200).optional(),
});

/** E.164 sending number, e.g. +13055551234. Empty string clears it. */
const e164OrEmpty = z
  .string()
  .max(20)
  .refine((v) => v === "" || /^\+[1-9]\d{6,14}$/.test(v), {
    message: "smsFromNumber must be E.164 (e.g. +13055551234) or empty",
  });

/** Request body for POST /api/compliance-config. */
export const complianceConfigSchema = z
  .object({
    sendingEnabled: z.boolean(),
    businessName: z.string().min(1, "businessName is required").max(120),
    physicalAddress: z
      .string()
      .min(1, "physicalAddress is required (CAN-SPAM)")
      .max(200),
    supportEmail: z.string().email("supportEmail must be a valid email").max(160),
    smsFromNumber: e164OrEmpty.optional(),
    quietHoursStart: z.number().int().min(0).max(23),
    quietHoursEnd: z.number().int().min(1).max(24),
    dailyCapPerRecipient: z.number().int().min(1).max(50),
    consentTextVersion: z
      .string()
      .min(1, "consentTextVersion is required")
      .max(40),
  })
  .refine((c) => c.quietHoursEnd > c.quietHoursStart, {
    message: "quietHoursEnd must be after quietHoursStart",
    path: ["quietHoursEnd"],
  });

/** Probe the send-time gate without dispatching (compliance tester). */
export const evaluateSendSchema = z.object({
  channel: channelSchema,
  recipient: z.string().min(3, "recipient is required").max(160),
  propertyId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Phase 5 — Live outreach engine
// ---------------------------------------------------------------------------

/** Open a thread: send the AgentConfig opening script to a property. */
export const startOutreachSchema = z.object({
  propertyId: z.string().uuid(),
  channel: channelSchema,
});

/** Approve a pending agent draft, optionally with an edited body. */
export const approveDraftSchema = z.object({
  draftId: z.string().uuid(),
  editedBody: z.string().min(1).max(1500).optional(),
});

export type ScrapePropertyInput = z.infer<typeof scrapePropertyInput>;
export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;
export type ScrapeIngestQuery = z.infer<typeof scrapeIngestQuerySchema>;
export type SkipTraceRequest = z.infer<typeof skipTraceRequestSchema>;
export type AgentThresholds = z.infer<typeof agentThresholdsSchema>;
export type AgentConfigInput = z.infer<typeof agentConfigSchema>;
export type ConsentRecordInput = z.infer<typeof consentRecordSchema>;
export type ManualSuppressionInput = z.infer<typeof manualSuppressionSchema>;
export type ComplianceConfigInput = z.infer<typeof complianceConfigSchema>;
export type EvaluateSendInput = z.infer<typeof evaluateSendSchema>;
export type StartOutreachInput = z.infer<typeof startOutreachSchema>;
export type ApproveDraftInput = z.infer<typeof approveDraftSchema>;
