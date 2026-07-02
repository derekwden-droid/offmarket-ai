// lib/providers/parcel-intelligence.ts
import "server-only";

import { z } from "zod";

export type VacancySignal =
  | "VACANT_INDICATED"
  | "STRUCTURE_INDICATED"
  | "INCONCLUSIVE";

export type EvidenceKind = "IMAGERY" | "FOOTPRINT";

export interface EvidenceSource {
  provider: string;
  kind: EvidenceKind;
  signal: VacancySignal;
  confidence: number;
  capturedAt: string | null;
  simulated: boolean;
  detail: string;
}

export interface ParcelReference {
  propertyId: string;
  lat: number | null;
  lng: number | null;
  apn: string | null;
  parcelGeometry: unknown | null;
  addressSeed: string;
}

export interface GatherOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const POINT_BUFFER_METERS = 25;

function nearmapKey(): string | null {
  return process.env.NEARMAP_API_KEY?.trim() || null;
}

function nearmapBase(): string {
  return process.env.NEARMAP_API_BASE?.trim() || "https://api.nearmap.com";
}

function nearmapFeaturePath(): string {
  return process.env.NEARMAP_AI_FEATURE_PATH?.trim() || "/ai/features/v4/features.json";
}

function footprintServiceUrl(): string | null {
  return process.env.FOOTPRINT_FEATURESERVER_URL?.trim() || null;
}

function footprintServiceToken(): string | null {
  return process.env.FOOTPRINT_FEATURESERVER_TOKEN?.trim() || null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function seededUnit(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const geoJsonPolygonSchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()),
});

function toArcgisPolygon(geometry: unknown): string | null {
  const parsed = geoJsonPolygonSchema.safeParse(geometry);
  if (!parsed.success) return null;

  const { type, coordinates } = parsed.data;
  const rings =
    type === "Polygon"
      ? (coordinates as number[][][])
      : (coordinates as number[][][][]).flat();

  if (!Array.isArray(rings) || rings.length === 0) return null;

  return JSON.stringify({ rings, spatialReference: { wkid: 4326 } });
}

const arcgisCountSchema = z.object({ count: z.number().int().nonnegative() });

async function fetchFootprintEvidence(
  ref: ParcelReference,
  timeoutMs: number,
): Promise<EvidenceSource> {
  const serviceUrl = footprintServiceUrl();

  if (!serviceUrl) {
    return simulateFootprint(ref);
  }

  const params = new URLSearchParams({
    where: "1=1",
    spatialRel: "esriSpatialRelIntersects",
    returnCountOnly: "true",
    f: "json",
  });

  const token = footprintServiceToken();
  if (token) params.set("token", token);

  const polygon = ref.parcelGeometry ? toArcgisPolygon(ref.parcelGeometry) : null;
  if (polygon) {
    params.set("geometry", polygon);
    params.set("geometryType", "esriGeometryPolygon");
    params.set("inSR", "4326");
  } else if (ref.lat !== null && ref.lng !== null) {
    params.set("geometry", `${ref.lng},${ref.lat}`);
    params.set("geometryType", "esriGeometryPoint");
    params.set("inSR", "4326");
    params.set("distance", String(POINT_BUFFER_METERS));
    params.set("units", "esriSRUnit_Meter");
  } else {
    return {
      provider: "footprint:arcgis",
      kind: "FOOTPRINT",
      signal: "INCONCLUSIVE",
      confidence: 0,
      capturedAt: null,
      simulated: false,
      detail: "No parcel geometry or lat/lng available for footprint intersect.",
    };
  }

  try {
    const res = await fetchWithTimeout(
      `${serviceUrl.replace(/\/$/, "")}/query?${params.toString()}`,
      { method: "GET", headers: { accept: "application/json" } },
      timeoutMs,
    );
    if (!res.ok) {
      return {
        provider: "footprint:arcgis",
        kind: "FOOTPRINT",
        signal: "INCONCLUSIVE",
        confidence: 0,
        capturedAt: null,
        simulated: false,
        detail: `Footprint service returned HTTP ${res.status}.`,
      };
    }

    const json: unknown = await res.json();
    const parsed = arcgisCountSchema.safeParse(json);
    if (!parsed.success) {
      return {
        provider: "footprint:arcgis",
        kind: "FOOTPRINT",
        signal: "INCONCLUSIVE",
        confidence: 0,
        capturedAt: null,
        simulated: false,
        detail: "Footprint service response did not match expected count shape.",
      };
    }

    const intersects = parsed.data.count > 0;
    return {
      provider: "footprint:arcgis",
      kind: "FOOTPRINT",
      signal: intersects ? "STRUCTURE_INDICATED" : "VACANT_INDICATED",
      confidence: intersects ? 0.85 : 0.7,
      capturedAt: null,
      simulated: false,
      detail: intersects
        ? `${parsed.data.count} building footprint(s) intersect the parcel.`
        : "No building footprint intersects the parcel.",
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      provider: "footprint:arcgis",
      kind: "FOOTPRINT",
      signal: "INCONCLUSIVE",
      confidence: 0,
      capturedAt: null,
      simulated: false,
      detail: aborted
        ? "Footprint service timed out."
        : "Footprint service request failed.",
    };
  }
}

function simulateFootprint(ref: ParcelReference): EvidenceSource {
  const u = seededUnit(`${ref.addressSeed}:footprint`);
  const structure = u > 0.7;
  return {
    provider: "simulator",
    kind: "FOOTPRINT",
    signal: structure ? "STRUCTURE_INDICATED" : "VACANT_INDICATED",
    confidence: structure ? 0.8 : 0.72,
    capturedAt: null,
    simulated: true,
    detail: structure
      ? "Simulated: footprint intersects parcel (no FOOTPRINT_FEATURESERVER_URL set)."
      : "Simulated: no footprint intersects parcel (no FOOTPRINT_FEATURESERVER_URL set).",
  };
}

const nearmapFeatureSchema = z
  .object({
    features: z
      .array(
        z
          .object({
            classId: z.union([z.string(), z.number()]).optional(),
            description: z.string().optional(),
            properties: z.record(z.unknown()).optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    surveyDate: z.string().optional(),
    captureDate: z.string().optional(),
    date: z.string().optional(),
  })
  .passthrough();

const STRUCTURE_KEYWORDS = ["building", "roof", "structure", "construction"];

async function fetchImageryEvidence(
  ref: ParcelReference,
  timeoutMs: number,
): Promise<EvidenceSource> {
  const key = nearmapKey();

  if (!key) {
    return simulateImagery(ref);
  }

  if (ref.lat === null || ref.lng === null) {
    return {
      provider: "nearmap",
      kind: "IMAGERY",
      signal: "INCONCLUSIVE",
      confidence: 0,
      capturedAt: null,
      simulated: false,
      detail: "No lat/lng available to query imagery AOI.",
    };
  }

  const params = new URLSearchParams({
    point: `${ref.lng},${ref.lat}`,
    apikey: key,
  });

  try {
    const res = await fetchWithTimeout(
      `${nearmapBase().replace(/\/$/, "")}${nearmapFeaturePath()}?${params.toString()}`,
      { method: "GET", headers: { accept: "application/json" } },
      timeoutMs,
    );
    if (!res.ok) {
      return {
        provider: "nearmap",
        kind: "IMAGERY",
        signal: "INCONCLUSIVE",
        confidence: 0,
        capturedAt: null,
        simulated: false,
        detail: `Nearmap returned HTTP ${res.status}.`,
      };
    }

    const json: unknown = await res.json();
    const parsed = nearmapFeatureSchema.safeParse(json);
    if (!parsed.success) {
      return {
        provider: "nearmap",
        kind: "IMAGERY",
        signal: "INCONCLUSIVE",
        confidence: 0,
        capturedAt: null,
        simulated: false,
        detail: "Nearmap response did not match expected shape.",
      };
    }

    const capturedAt =
      parsed.data.surveyDate ?? parsed.data.captureDate ?? parsed.data.date ?? null;

    const hasStructure = parsed.data.features.some((f) => {
      const hay = `${f.description ?? ""} ${String(f.classId ?? "")}`.toLowerCase();
      return STRUCTURE_KEYWORDS.some((kw) => hay.includes(kw));
    });

    return {
      provider: "nearmap",
      kind: "IMAGERY",
      signal: hasStructure ? "STRUCTURE_INDICATED" : "VACANT_INDICATED",
      confidence: hasStructure ? 0.9 : 0.82,
      capturedAt,
      simulated: false,
      detail: hasStructure
        ? "Nearmap AI detected building/roof feature(s) in the parcel AOI."
        : "Nearmap AI returned no building/roof features in the parcel AOI.",
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      provider: "nearmap",
      kind: "IMAGERY",
      signal: "INCONCLUSIVE",
      confidence: 0,
      capturedAt: null,
      simulated: false,
      detail: aborted ? "Nearmap request timed out." : "Nearmap request failed.",
    };
  }
}

function simulateImagery(ref: ParcelReference): EvidenceSource {
  const u = seededUnit(`${ref.addressSeed}:imagery`);
  const structure = u > 0.72;
  const daysAgo = Math.floor(seededUnit(`${ref.addressSeed}:imgdate`) * 540);
  const capturedAt = new Date(Date.now() - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    provider: "simulator",
    kind: "IMAGERY",
    signal: structure ? "STRUCTURE_INDICATED" : "VACANT_INDICATED",
    confidence: structure ? 0.86 : 0.8,
    capturedAt,
    simulated: true,
    detail: structure
      ? "Simulated: imagery indicates a structure (no NEARMAP_API_KEY set)."
      : "Simulated: imagery indicates vacant land (no NEARMAP_API_KEY set).",
  };
}

export async function gatherVacancyEvidence(
  ref: ParcelReference,
  opts?: GatherOptions,
): Promise<EvidenceSource[]> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [footprint, imagery] = await Promise.all([
    fetchFootprintEvidence(ref, timeoutMs),
    fetchImageryEvidence(ref, timeoutMs),
  ]);
  return [footprint, imagery];
}
