"use server";

import { scrapeIngestQuerySchema } from "@/lib/validations";
import {
  runProviderIngest,
  type IngestSummary,
  type IngestedPropertyRow,
} from "@/lib/services/scrape";

/**
 * Server action backing the Scrape page. The browser cannot hold
 * `INTERNAL_API_SECRET`, so the UI triggers a licensed-provider pull through
 * this action (which runs server-side and calls the ingest service directly)
 * rather than the signed `/api/scrape` webhook. "ALL" filters are treated as
 * "no filter" for the provider query.
 */
export interface ScrapeIngestResult {
  summary: IngestSummary;
  rows: IngestedPropertyRow[];
}

export async function runScrapeIngestAction(
  input: unknown,
): Promise<ScrapeIngestResult> {
  const query = scrapeIngestQuerySchema.parse(input);
  return runProviderIngest({
    state: query.state && query.state !== "ALL" ? query.state : undefined,
    propertyType:
      query.propertyType && query.propertyType !== "ALL"
        ? query.propertyType
        : undefined,
    source: query.source,
    limit: query.limit,
  });
}
