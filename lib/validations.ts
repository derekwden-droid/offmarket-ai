import { z } from "zod";

/**
 * Zod schemas shared by API route handlers and (optionally) client forms.
 * Keeping validation here guarantees the server and any future client wiring
 * agree on the exact request contract.
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
    .max(200, "a single batch is limited to 200 ids"),
  concurrency: z.number().int().min(1).max(20).optional(),
});

export type ScrapePropertyInput = z.infer<typeof scrapePropertyInput>;
export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;
export type SkipTraceRequest = z.infer<typeof skipTraceRequestSchema>;
