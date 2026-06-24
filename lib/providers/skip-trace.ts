import "server-only";
import { z } from "zod";

/**
 * Skip-trace provider abstraction.
 *
 * If `SKIPTRACE_API_URL` and `SKIPTRACE_API_KEY` are configured the real HTTP
 * provider is called. Otherwise a deterministic local simulation is used so the
 * product is fully demonstrable without a paid data contract. The simulation is
 * seeded by the property address, so the same address always resolves to the
 * same result — making local development and screenshots reproducible.
 */

const TIMEOUT_MS = 8000;
const SIMULATED_HIT_RATE = 0.72;

export interface SkipTraceQuery {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface SkipTraceHit {
  matched: true;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  confidence: number;
}

export interface SkipTraceMiss {
  matched: false;
  reason: string;
}

export type SkipTraceResult = SkipTraceHit | SkipTraceMiss;

/** Shape we accept from a real upstream provider (kept intentionally loose). */
const providerResponseSchema = z.object({
  owner: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
});

function isLiveProviderConfigured(): boolean {
  return Boolean(process.env.SKIPTRACE_API_URL && process.env.SKIPTRACE_API_KEY);
}

/** FNV-1a hash -> unsigned 32-bit integer. */
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

const FIRST_NAMES = [
  "James", "Maria", "Robert", "Linda", "David", "Patricia",
  "Carlos", "Jennifer", "Michael", "Angela", "William", "Sofia",
];
const LAST_NAMES = [
  "Hernandez", "Smith", "Johnson", "Garcia", "Williams", "Brown",
  "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Thomas",
];

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function buildPhone(rng: () => number): string {
  const area = 200 + Math.floor(rng() * 799);
  const prefix = 200 + Math.floor(rng() * 799);
  const line = Math.floor(rng() * 10000)
    .toString()
    .padStart(4, "0");
  return `(${area}) ${prefix}-${line}`;
}

/** Deterministic local simulation used when no live provider is configured. */
export function simulateSkipTrace(query: SkipTraceQuery): SkipTraceResult {
  const seed = hashString(
    `${query.address}|${query.city}|${query.state}|${query.zip}`.toLowerCase(),
  );
  const rng = mulberry32(seed);

  if (rng() > SIMULATED_HIT_RATE) {
    return { matched: false, reason: "No owner record matched." };
  }

  const first = pick(FIRST_NAMES, rng);
  const last = pick(LAST_NAMES, rng);
  const ownerName = `${first} ${last}`;
  const handle = `${first}.${last}`.toLowerCase();
  const confidence = Number((0.6 + rng() * 0.35).toFixed(2));

  return {
    matched: true,
    ownerName,
    ownerPhone: buildPhone(rng),
    ownerEmail: `${handle}@example.com`,
    confidence,
  };
}

async function callLiveProvider(query: SkipTraceQuery): Promise<SkipTraceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(process.env.SKIPTRACE_API_URL as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SKIPTRACE_API_KEY as string}`,
      },
      body: JSON.stringify(query),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        matched: false,
        reason: `Provider responded with status ${response.status}.`,
      };
    }

    const parsed = providerResponseSchema.parse(await response.json());
    const phone = parsed.owner?.phone;
    const email = parsed.owner?.email;
    const name = parsed.owner?.name;

    if (!name || (!phone && !email)) {
      return { matched: false, reason: "Provider returned no usable contact." };
    }

    return {
      matched: true,
      ownerName: name,
      ownerPhone: phone ?? "",
      ownerEmail: email ?? "",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "Provider request timed out."
        : "Provider request failed.";
    return { matched: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve owner contact details for a property via live provider or simulation. */
export async function skipTrace(query: SkipTraceQuery): Promise<SkipTraceResult> {
  if (isLiveProviderConfigured()) {
    return callLiveProvider(query);
  }
  return simulateSkipTrace(query);
}
