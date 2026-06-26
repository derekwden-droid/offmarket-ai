import "server-only";
import { z } from "zod";
import type { ScrapePropertyInput } from "@/lib/validations";

/**
 * Licensed property-data provider abstraction.
 *
 * If `PROPERTY_DATA_API_URL` and `PROPERTY_DATA_API_KEY` are configured the real
 * REST provider is queried and its rows are normalized to `ScrapePropertyInput`
 * (the exact shape `/api/scrape` ingests). Otherwise a deterministic local
 * simulation is used so acquisition is fully demonstrable without a paid data
 * contract — seeded by the query so the same filters always yield the same set.
 *
 * Only licensed/assessor/parcel providers belong here. No listing-hub or MLS
 * scraping (see the launch schedule's data-sourcing constraints).
 */

const TIMEOUT_MS = 10_000;

export interface PropertyDataQuery {
  /** Two-letter state filter, or undefined for the provider default. */
  state?: string;
  /** Property type filter (Land, Single-Family, Multi-Family, Commercial). */
  propertyType?: string;
  /** Source label recorded on each ingested row (e.g. "county-records"). */
  source?: string;
  /** Max rows to pull (1–500). */
  limit: number;
}

/** Loose shape accepted from a real upstream provider; mapped to our model. */
const providerRecordSchema = z.object({
  address: z.string().optional(),
  line1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  postalCode: z.string().optional(),
  propertyType: z.string().optional(),
  useCode: z.string().optional(),
  zoning: z.string().optional(),
});

const providerResponseSchema = z.object({
  records: z.array(providerRecordSchema).optional(),
  results: z.array(providerRecordSchema).optional(),
});

type ProviderRecord = z.infer<typeof providerRecordSchema>;

function isLiveProviderConfigured(): boolean {
  return Boolean(
    process.env.PROPERTY_DATA_API_URL && process.env.PROPERTY_DATA_API_KEY,
  );
}

/** FNV-1a hash -> unsigned 32-bit integer (matches the skip-trace provider). */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, seedable PRNG returning a float in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREETS = [
  "Maple Ave", "Oak St", "Sunset Blvd", "Palm Dr", "Bayshore Rd",
  "Magnolia Ln", "Industrial Pkwy", "Lakeview Ct", "Harbor Way", "Cypress Trail",
];
const TYPES = ["Land", "Single-Family", "Multi-Family", "Commercial"];
const ZONING = ["RAC", "R-1", "C-2", "MF-3", "AG"];
const CITY_BY_STATE: Record<string, { city: string; zip: string }[]> = {
  FL: [
    { city: "Tampa", zip: "33602" },
    { city: "Orlando", zip: "32801" },
    { city: "Jacksonville", zip: "32202" },
  ],
  TX: [
    { city: "Austin", zip: "78701" },
    { city: "Houston", zip: "77002" },
    { city: "Dallas", zip: "75201" },
  ],
  GA: [{ city: "Atlanta", zip: "30303" }, { city: "Savannah", zip: "31401" }],
  NC: [{ city: "Charlotte", zip: "28202" }, { city: "Raleigh", zip: "27601" }],
  TN: [{ city: "Nashville", zip: "37203" }, { city: "Memphis", zip: "38103" }],
  AZ: [{ city: "Phoenix", zip: "85004" }, { city: "Tucson", zip: "85701" }],
};
const STATES = Object.keys(CITY_BY_STATE);

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** Normalize one upstream record; returns null when it lacks required fields. */
function normalizeRecord(
  record: ProviderRecord,
  fallbackSource: string,
): ScrapePropertyInput | null {
  const address = record.address ?? record.line1;
  const city = record.city;
  const state = record.state;
  const zip = record.zip ?? record.postalCode;
  const propertyType = record.propertyType ?? record.useCode;

  if (!address || !city || !state || !zip || !propertyType) {
    return null;
  }

  return {
    address: address.trim().slice(0, 200),
    city: city.trim().slice(0, 120),
    state: state.trim().toUpperCase().slice(0, 2),
    zip: zip.trim().slice(0, 12),
    propertyType: propertyType.trim().slice(0, 60),
    zoning: record.zoning?.trim().slice(0, 60) || undefined,
    scrapeSource: fallbackSource.slice(0, 80),
  };
}

/** Deterministic local simulation used when no live provider is configured. */
export function simulatePropertyData(
  query: PropertyDataQuery,
): ScrapePropertyInput[] {
  const source = query.source ?? "licensed-provider";
  const seed = hashString(
    `${query.state ?? "ALL"}|${query.propertyType ?? "ALL"}|${source}|${query.limit}`.toLowerCase(),
  );
  const rng = mulberry32(seed);
  const out: ScrapePropertyInput[] = [];

  for (let i = 0; i < query.limit; i += 1) {
    const state =
      query.state && query.state !== "ALL" ? query.state : pick(STATES, rng);
    const cityRef = pick(CITY_BY_STATE[state] ?? CITY_BY_STATE.FL, rng);
    const number = 100 + Math.floor(rng() * 9899);
    const propertyType =
      query.propertyType && query.propertyType !== "ALL"
        ? query.propertyType
        : pick(TYPES, rng);

    out.push({
      address: `${number} ${pick(STREETS, rng)}`,
      city: cityRef.city,
      state: state.toUpperCase(),
      zip: cityRef.zip,
      propertyType,
      zoning: rng() > 0.25 ? pick(ZONING, rng) : undefined,
      scrapeSource: source,
    });
  }
  return out;
}

async function callLiveProvider(
  query: PropertyDataQuery,
): Promise<ScrapePropertyInput[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const source = query.source ?? "licensed-provider";

  try {
    const url = new URL(process.env.PROPERTY_DATA_API_URL as string);
    if (query.state && query.state !== "ALL") url.searchParams.set("state", query.state);
    if (query.propertyType && query.propertyType !== "ALL") {
      url.searchParams.set("propertyType", query.propertyType);
    }
    url.searchParams.set("limit", String(query.limit));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.PROPERTY_DATA_API_KEY as string}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Property-data provider responded ${response.status}.`);
    }

    const parsed = providerResponseSchema.parse(await response.json());
    const records = parsed.records ?? parsed.results ?? [];
    return records
      .map((record) => normalizeRecord(record, source))
      .filter((record): record is ScrapePropertyInput => record !== null)
      .slice(0, query.limit);
  } finally {
    clearTimeout(timeout);
  }
}

/** Pull normalized property records via the live provider or the simulation. */
export async function fetchPropertyData(
  query: PropertyDataQuery,
): Promise<ScrapePropertyInput[]> {
  if (isLiveProviderConfigured()) {
    return callLiveProvider(query);
  }
  return simulatePropertyData(query);
}
