import "server-only";
import { z } from "zod";
import type { ScrapePropertyInput } from "@/lib/validations";

/**
 * Public-records (county) data adapter.
 *
 * Targets Socrata-style open-data portals (the common, ToS-permitted way US
 * counties publish parcel/assessor records) when `PUBLIC_RECORDS_API_URL` is
 * set, optionally authenticated with `PUBLIC_RECORDS_APP_TOKEN`. Without config
 * it falls back to a deterministic simulation so the scheduled pipeline is
 * demonstrable. NEVER point this at a listing hub or MLS — licensed/open
 * public records only (see the launch schedule's data-sourcing constraints).
 */

const TIMEOUT_MS = 12_000;
const DEFAULT_SOURCE = "county-records";

export interface CountyQuery {
  /** Max rows to pull this run (1–500). */
  limit: number;
  /** Source label recorded on each row. */
  source?: string;
}

/** Socrata rows are flat JSON objects; column names vary by dataset. */
const socrataRowSchema = z
  .object({
    situs_address: z.string().optional(),
    property_address: z.string().optional(),
    address: z.string().optional(),
    situs_city: z.string().optional(),
    city: z.string().optional(),
    situs_state: z.string().optional(),
    state: z.string().optional(),
    situs_zip: z.string().optional(),
    zip: z.string().optional(),
    zip_code: z.string().optional(),
    property_use: z.string().optional(),
    land_use: z.string().optional(),
    property_type: z.string().optional(),
    zoning: z.string().optional(),
  })
  .passthrough();

type SocrataRow = z.infer<typeof socrataRowSchema>;

function isConfigured(): boolean {
  return Boolean(process.env.PUBLIC_RECORDS_API_URL);
}

function firstOf(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** Map a Socrata county row to our model; null when required fields are absent. */
export function normalizeCountyRow(
  row: SocrataRow,
  source: string,
): ScrapePropertyInput | null {
  const address = firstOf(row.situs_address, row.property_address, row.address);
  const city = firstOf(row.situs_city, row.city);
  const state = firstOf(row.situs_state, row.state);
  const zip = firstOf(row.situs_zip, row.zip, row.zip_code);
  const propertyType = firstOf(row.property_use, row.land_use, row.property_type);

  if (!address || !city || !state || !zip || !propertyType) return null;

  return {
    address: address.slice(0, 200),
    city: city.slice(0, 120),
    state: state.toUpperCase().slice(0, 2),
    zip: zip.slice(0, 12),
    propertyType: propertyType.slice(0, 60),
    zoning: firstOf(row.zoning)?.slice(0, 60),
    scrapeSource: source.slice(0, 80),
  };
}

/* ---- deterministic simulation (mirrors the licensed-provider seed style) --- */

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
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
const STREETS = ["County Rd 12", "Old Mill Rd", "Pinehurst Ave", "Cedar Hollow", "River Bend Dr"];
const TYPES = ["Land", "Single-Family", "Multi-Family"];
const FL_CITIES = [
  { city: "Tampa", zip: "33610" },
  { city: "Orlando", zip: "32805" },
  { city: "Lakeland", zip: "33801" },
];

export function simulateCountyRecords(query: CountyQuery): ScrapePropertyInput[] {
  const source = query.source ?? DEFAULT_SOURCE;
  // Date-seeded so each scheduled run yields a fresh, reproducible batch.
  const day = new Date().toISOString().slice(0, 10);
  const rng = mulberry32(hashString(`${day}|${source}|${query.limit}`));
  const out: ScrapePropertyInput[] = [];
  for (let i = 0; i < query.limit; i += 1) {
    const ref = FL_CITIES[Math.floor(rng() * FL_CITIES.length) % FL_CITIES.length];
    const number = 100 + Math.floor(rng() * 9899);
    out.push({
      address: `${number} ${STREETS[Math.floor(rng() * STREETS.length) % STREETS.length]}`,
      city: ref.city,
      state: "FL",
      zip: ref.zip,
      propertyType: TYPES[Math.floor(rng() * TYPES.length) % TYPES.length],
      zoning: rng() > 0.5 ? "AG" : undefined,
      scrapeSource: source,
    });
  }
  return out;
}

async function callSocrata(query: CountyQuery): Promise<ScrapePropertyInput[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const source = query.source ?? DEFAULT_SOURCE;

  try {
    const url = new URL(process.env.PUBLIC_RECORDS_API_URL as string);
    url.searchParams.set("$limit", String(query.limit));

    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.PUBLIC_RECORDS_APP_TOKEN) {
      headers["X-App-Token"] = process.env.PUBLIC_RECORDS_APP_TOKEN;
    }

    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Public-records source responded ${response.status}.`);
    }

    const rows = z.array(socrataRowSchema).parse(await response.json());
    return rows
      .map((row) => normalizeCountyRow(row, source))
      .filter((row): row is ScrapePropertyInput => row !== null)
      .slice(0, query.limit);
  } finally {
    clearTimeout(timeout);
  }
}

/** Pull normalized county records via the configured source or the simulation. */
export async function fetchCountyRecords(
  query: CountyQuery,
): Promise<ScrapePropertyInput[]> {
  if (isConfigured()) {
    return callSocrata(query);
  }
  return simulateCountyRecords(query);
}
