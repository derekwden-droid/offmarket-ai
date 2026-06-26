import "server-only";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ScrapePropertyInput } from "@/lib/validations";
import {
  fetchPropertyData,
  type PropertyDataQuery,
} from "@/lib/providers/property-data";

/**
 * Ingestion service — the single source of truth for writing scraped/licensed
 * property records. The `/api/scrape` webhook, the licensed-provider pull, and
 * the scheduled county cron all funnel through `ingestProperties`, so the
 * de-duplication and package-linking rules live in exactly one place.
 */

export interface IngestSummary {
  received: number;
  created: number;
  duplicates: number;
  connectedToPackage: number;
}

export interface IngestedPropertyRow {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  status: LeadStatus;
}

function keyOf(property: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return `${property.address}|${property.city}|${property.state}|${property.zip}`;
}

/**
 * Ingest a batch of normalized properties, de-duplicating against the composite
 * (address, city, state, zip) identity. Idempotent: replaying the same batch
 * creates zero new rows. Optionally connects the matched set to a ListPackage.
 */
export async function ingestProperties(input: {
  properties: ScrapePropertyInput[];
  listPackageId?: string;
}): Promise<IngestSummary> {
  const { properties, listPackageId } = input;

  const existing = await prisma.property.findMany({
    where: {
      OR: properties.map((property) => ({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
      })),
    },
    select: { address: true, city: true, state: true, zip: true },
  });

  const existingKeys = new Set(existing.map(keyOf));
  const seen = new Set<string>();
  const toCreate: ScrapePropertyInput[] = [];

  for (const property of properties) {
    const key = keyOf(property);
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    toCreate.push(property);
  }

  let created = 0;
  if (toCreate.length > 0) {
    const result = await prisma.property.createMany({
      data: toCreate.map((property) => ({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        propertyType: property.propertyType,
        zoning: property.zoning,
        scrapeSource: property.scrapeSource,
      })),
      skipDuplicates: true,
    });
    created = result.count;
  }

  let connectedToPackage = 0;
  if (listPackageId) {
    const matched = await prisma.property.findMany({
      where: {
        OR: properties.map((property) => ({
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
        })),
      },
      select: { id: true },
    });

    if (matched.length > 0) {
      await prisma.listPackage.update({
        where: { id: listPackageId },
        data: { properties: { connect: matched.map((p) => ({ id: p.id })) } },
      });
      connectedToPackage = matched.length;
    }
  }

  return {
    received: properties.length,
    created,
    duplicates: properties.length - created,
    connectedToPackage,
  };
}

/** Fetch the rows for a just-ingested set so the UI can show real ids/status. */
export async function findIngestedRows(
  properties: ScrapePropertyInput[],
): Promise<IngestedPropertyRow[]> {
  if (properties.length === 0) return [];
  return prisma.property.findMany({
    where: {
      OR: properties.map((property) => ({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
      })),
    },
    orderBy: { createdAt: "desc" },
    take: properties.length,
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      propertyType: true,
      status: true,
    },
  });
}

export interface ProviderIngestResult {
  summary: IngestSummary;
  rows: IngestedPropertyRow[];
}

/**
 * Pull from the licensed property-data provider, ingest the normalized rows as
 * RAW leads, and return both the ingest summary and the resulting rows.
 */
export async function runProviderIngest(
  query: PropertyDataQuery,
): Promise<ProviderIngestResult> {
  const properties = await fetchPropertyData(query);
  const summary = await ingestProperties({ properties });
  const rows = await findIngestedRows(properties);
  return { summary, rows };
}
