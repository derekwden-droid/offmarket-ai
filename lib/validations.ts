import { z } from "zod";

// ---------------------------------------------------------------------------
// Phase 1–3 — Scraping & skip-trace
// ---------------------------------------------------------------------------

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

export const channelSchema = z.enum(["SMS", "EMAIL"]);

export const agentThresholdsSchema = z.object({
  temperature: z.number().min(0).max(1),
  persistence: z.number().int().min(1).max(5),
  dailyCap: z.number().int().min(1).max(500),
});

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

export const scrapeIngestQuerySchema = z.object({
  state: z.string().max(40).optional(),
  propertyType: z.string().max(60).optional(),
  source: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Phase 4 — Compliance backbone
// ---------------------------------------------------------------------------

export const suppressionReasonSchema = z.enum([
  "STOP",
  "DNC",
  "BOUNCE",
  "MANUAL",
]);

export const consentRecordSchema = z.object({
  propertyId: z.string().uuid(),
  channel: channelSchema,
  source: z.string().min(1, "source is required").max(120),
  consentTextVersion: z.string().min(1).max(40).optional(),
  ipAddress: z.string().max(45).optional(),
});

export const manualSuppressionSchema = z.object({
  value: z.string().min(3, "value is required").max(160),
  channel: channelSchema,
  reason: suppressionReasonSchema,
  detail: z.string().max(200).optional(),
});

const e164OrEmpty = z
  .string()
  .max(20)
  .refine((v) => v === "" || /^\+[1-9]\d{6,14}$/.test(v), {
    message: "smsFromNumber must be E.164 (e.g. +13055551234) or empty",
  });

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

export const evaluateSendSchema = z.object({
  channel: channelSchema,
  recipient: z.string().min(3, "recipient is required").max(160),
  propertyId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Phase 5 — Live outreach engine
// ---------------------------------------------------------------------------

export const startOutreachSchema = z.object({
  propertyId: z.string().uuid(),
  channel: channelSchema,
});

export const approveDraftSchema = z.object({
  draftId: z.string().uuid(),
  editedBody: z.string().min(1).max(1500).optional(),
});

// ---------------------------------------------------------------------------
// Vacancy verification (new)
// ---------------------------------------------------------------------------

export const verifyVacancyConfigSchema = z.object({
  imageryMaxAgeDays: z.number().int().positive().max(3650).default(365),
  minConfidenceToConfirm: z.number().min(0).max(1).default(0.8),
  structureVetoConfidence: z.number().min(0).max(1).default(0.6),
});

export const verifyVacancySchema = z.object({
  propertyId: z.string().uuid(),
  parcelOverride: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      apn: z.string().max(80).optional(),
      parcelGeometry: z.unknown().optional(),
      assessorVacantFlag: z.boolean().optional(),
      landUseCode: z.string().max(80).optional(),
    })
    .strict()
    .optional(),
  config: verifyVacancyConfigSchema.partial().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
export type VerifyVacancyConfigInput = z.infer<typeof verifyVacancyConfigSchema>;
export type VerifyVacancyInput = z.infer<typeof verifyVacancySchema>;
