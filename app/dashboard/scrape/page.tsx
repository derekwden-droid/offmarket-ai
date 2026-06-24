"use client";

import * as React from "react";
import { Radar, Play, Square, Crosshair, Loader2, Users } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/error-boundary";
import { LogConsole, type LogLine, type LogKind } from "@/components/dashboard/log-console";
import { useToast } from "@/components/ui/toast";
import { mapWithConcurrency } from "@/lib/concurrency";
import { formatNumber } from "@/lib/utils";

/*
 * This screen ships with a self-contained simulation engine so the acquisition
 * workflow is fully demonstrable without a live data contract. To go live:
 *   1. Replace `startScrape` with a POST to /api/scrape (send the filter set;
 *      stream or poll for ingested rows).
 *   2. Replace `simulateTrace` / `traceSelected` with POST /api/skip-trace,
 *      passing the selected property ids and a concurrency value.
 * The component contracts (ScrapedRecord, LogLine) already mirror the API
 * response shapes, so wiring is a drop-in swap.
 */

interface ScrapedRecord {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  zoning?: string;
  source: string;
  status: LeadStatus;
  tracing: boolean;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
}

interface ScrapeFilters {
  state: string;
  propertyType: string;
  source: string;
}

interface CityRef {
  city: string;
  zip: string;
}

const STATES = ["FL", "TX", "GA", "NC", "TN", "AZ"];
const TYPES = ["Land", "Single-Family", "Multi-Family", "Commercial"];
const SOURCES = [
  "County Records",
  "MLS Expired",
  "Tax Delinquent",
  "Probate Filing",
  "FSBO",
];
const ZONING = ["RAC", "R-1", "C-2", "MF-3", "AG", undefined];
const STREETS = [
  "Maple Ave",
  "Oak St",
  "Sunset Blvd",
  "Palm Dr",
  "Bayshore Rd",
  "Magnolia Ln",
  "Industrial Pkwy",
  "Lakeview Ct",
  "Harbor Way",
  "Cypress Trail",
];
const CITY_BY_STATE: Record<string, CityRef[]> = {
  FL: [
    { city: "Tampa", zip: "33602" },
    { city: "Orlando", zip: "32801" },
    { city: "Fort Lauderdale", zip: "33301" },
    { city: "Jacksonville", zip: "32202" },
  ],
  TX: [
    { city: "Austin", zip: "73301" },
    { city: "Houston", zip: "77002" },
    { city: "Dallas", zip: "75201" },
  ],
  GA: [
    { city: "Atlanta", zip: "30303" },
    { city: "Savannah", zip: "31401" },
  ],
  NC: [
    { city: "Charlotte", zip: "28202" },
    { city: "Raleigh", zip: "27601" },
  ],
  TN: [
    { city: "Nashville", zip: "37203" },
    { city: "Memphis", zip: "38103" },
  ],
  AZ: [
    { city: "Phoenix", zip: "85004" },
    { city: "Tucson", zip: "85701" },
  ],
};
const FIRST_NAMES = [
  "James", "Maria", "Robert", "Linda", "David", "Patricia", "Carlos", "Sofia",
];
const LAST_NAMES = [
  "Hernandez", "Smith", "Johnson", "Garcia", "Davis", "Rodriguez", "Wilson",
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePhone(): string {
  const area = 200 + Math.floor(Math.random() * 799);
  const prefix = 200 + Math.floor(Math.random() * 799);
  const line = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `(${area}) ${prefix}-${line}`;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function makeCandidate(filters: ScrapeFilters): Omit<
  ScrapedRecord,
  "id" | "status" | "tracing" | "ownerName" | "ownerPhone" | "ownerEmail"
> {
  const state =
    filters.state === "ALL" ? pick(STATES) : filters.state;
  const cityRef = pick(CITY_BY_STATE[state] ?? CITY_BY_STATE.FL);
  const number = 100 + Math.floor(Math.random() * 9899);
  const propertyType =
    filters.propertyType === "ALL" ? pick(TYPES) : filters.propertyType;
  const source = filters.source === "ALL" ? pick(SOURCES) : filters.source;

  return {
    address: `${number} ${pick(STREETS)}`,
    city: cityRef.city,
    state,
    zip: cityRef.zip,
    propertyType,
    zoning: pick(ZONING),
    source,
  };
}

interface TraceResult {
  matched: boolean;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
}

function simulateTrace(): TraceResult {
  if (Math.random() > 0.72) return { matched: false };
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  return {
    matched: true,
    ownerName: `${first} ${last}`,
    ownerPhone: makePhone(),
    ownerEmail: `${first}.${last}`.toLowerCase() + "@example.com",
  };
}

export default function ScrapePage() {
  const { toast } = useToast();

  const [state, setState] = React.useState("FL");
  const [propertyType, setPropertyType] = React.useState("ALL");
  const [source, setSource] = React.useState("ALL");
  const [limit, setLimit] = React.useState(25);

  const [records, setRecords] = React.useState<ScrapedRecord[]>([]);
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [isScraping, setIsScraping] = React.useState(false);
  const [batchTracing, setBatchTracing] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [counters, setCounters] = React.useState({
    scanned: 0,
    matched: 0,
    deduped: 0,
    ingested: 0,
  });

  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = React.useRef<() => void>(() => {});
  const scannedRef = React.useRef(0);
  const matchedRef = React.useRef(0);
  const dedupedRef = React.useRef(0);
  const ingestedRef = React.useRef(0);
  const limitRef = React.useRef(25);
  const filtersRef = React.useRef<ScrapeFilters>({
    state: "FL",
    propertyType: "ALL",
    source: "ALL",
  });

  const pushLog = React.useCallback((kind: LogKind, text: string) => {
    setLogs((previous) => {
      const next = [
        ...previous,
        { id: crypto.randomUUID(), kind, text, ts: timestamp() },
      ];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, []);

  const stopScrape = React.useCallback(
    (completed: boolean) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsScraping(false);
      if (completed) {
        pushLog(
          "success",
          `Scrape complete — ${ingestedRef.current} ingested, ${dedupedRef.current} duplicates skipped.`,
        );
        toast({
          title: "Scrape complete",
          description: `${ingestedRef.current} new properties ingested.`,
          variant: "success",
        });
      }
    },
    [pushLog, toast],
  );

  const tick = React.useCallback(() => {
    const candidate = makeCandidate(filtersRef.current);
    scannedRef.current += 1;

    const isDuplicate = Math.random() < 0.16;
    if (isDuplicate) {
      dedupedRef.current += 1;
      pushLog("warn", `Duplicate skipped — ${candidate.address}, ${candidate.city}`);
    } else {
      ingestedRef.current += 1;
      matchedRef.current += 1;
      const record: ScrapedRecord = {
        ...candidate,
        id: crypto.randomUUID(),
        status: "RAW",
        tracing: false,
        ownerName: null,
        ownerPhone: null,
        ownerEmail: null,
      };
      setRecords((previous) => [record, ...previous]);
      pushLog(
        "data",
        `Ingested ${candidate.address}, ${candidate.city} ${candidate.state} · ${candidate.propertyType}`,
      );
    }

    setCounters({
      scanned: scannedRef.current,
      matched: matchedRef.current,
      deduped: dedupedRef.current,
      ingested: ingestedRef.current,
    });

    if (ingestedRef.current >= limitRef.current) {
      stopScrape(true);
    }
  }, [pushLog, stopScrape]);

  React.useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  React.useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startScrape() {
    if (intervalRef.current) return;
    scannedRef.current = 0;
    matchedRef.current = 0;
    dedupedRef.current = 0;
    ingestedRef.current = 0;
    limitRef.current = clampLimit(limit);
    filtersRef.current = { state, propertyType, source };

    setCounters({ scanned: 0, matched: 0, deduped: 0, ingested: 0 });
    setRecords([]);
    setSelected(new Set());
    setLogs([]);
    setIsScraping(true);

    const filterNote = [
      state !== "ALL" ? `state=${state}` : null,
      propertyType !== "ALL" ? `type=${propertyType}` : null,
      source !== "ALL" ? `source=${source}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    pushLog(
      "info",
      `Starting scrape — target ${limitRef.current} records${filterNote ? ` (${filterNote})` : ""}.`,
    );

    intervalRef.current = setInterval(() => tickRef.current(), 320);
  }

  function applyTraceResult(
    record: ScrapedRecord,
    result: TraceResult,
  ): ScrapedRecord {
    if (result.matched) {
      return {
        ...record,
        tracing: false,
        status: "SKIP_TRACED",
        ownerName: result.ownerName ?? null,
        ownerPhone: result.ownerPhone ?? null,
        ownerEmail: result.ownerEmail ?? null,
      };
    }
    return { ...record, tracing: false, status: "SKIP_TRACED" };
  }

  async function traceOne(id: string) {
    setRecords((previous) =>
      previous.map((record) =>
        record.id === id ? { ...record, tracing: true } : record,
      ),
    );
    await delay(500 + Math.random() * 600);
    const result = simulateTrace();
    setRecords((previous) =>
      previous.map((record) =>
        record.id === id ? applyTraceResult(record, result) : record,
      ),
    );
    pushLog(
      result.matched ? "success" : "warn",
      result.matched
        ? `Owner found — ${result.ownerName}`
        : "No owner match for traced record.",
    );
  }

  async function traceSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0 || batchTracing) return;

    setBatchTracing(true);
    setRecords((previous) =>
      previous.map((record) =>
        selected.has(record.id) ? { ...record, tracing: true } : record,
      ),
    );
    pushLog("info", `Skip tracing ${ids.length} selected records…`);

    let matched = 0;
    await mapWithConcurrency(ids, 4, async (id) => {
      await delay(400 + Math.random() * 700);
      const result = simulateTrace();
      if (result.matched) matched += 1;
      setRecords((previous) =>
        previous.map((record) =>
          record.id === id ? applyTraceResult(record, result) : record,
        ),
      );
    });

    setBatchTracing(false);
    setSelected(new Set());
    pushLog("success", `Batch trace done — ${matched}/${ids.length} matched.`);
    toast({
      title: "Skip trace complete",
      description: `${matched} of ${ids.length} records matched an owner.`,
      variant: matched > 0 ? "success" : "warning",
    });
  }

  function toggleSelect(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((previous) => {
      if (previous.size === records.length) return new Set();
      return new Set(records.map((record) => record.id));
    });
  }

  const counterCards = [
    { label: "Scanned", value: counters.scanned, accent: "#9CA3AF" },
    { label: "Matched", value: counters.matched, accent: "#3B82F6" },
    { label: "Deduped", value: counters.deduped, accent: "#F59E0B" },
    { label: "Ingested", value: counters.ingested, accent: "#10B981" },
  ];

  const allSelected =
    records.length > 0 && selected.size === records.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4" style={{ color: "#3B82F6" }} />
            <h2 className="text-sm font-semibold text-gray-100">
              Acquisition Filters
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="state">State</Label>
              <Select
                id="state"
                value={state}
                onChange={(event) => setState(event.target.value)}
                disabled={isScraping}
              >
                <option value="ALL">All states</option>
                {STATES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="type">Property type</Label>
              <Select
                id="type"
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value)}
                disabled={isScraping}
              >
                <option value="ALL">All types</option>
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="source">Source</Label>
              <Select
                id="source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                disabled={isScraping}
              >
                <option value="ALL">All sources</option>
                {SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="limit">Record limit</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(event) =>
                  setLimit(clampLimit(Number(event.target.value)))
                }
                disabled={isScraping}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            {isScraping ? (
              <Button
                variant="destructive"
                onClick={() => stopScrape(false)}
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            ) : (
              <Button variant="ai" glow="cyber" onClick={startScrape}>
                <Play className="h-4 w-4" />
                Run scrape
              </Button>
            )}
            {isScraping ? (
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Streaming records…
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counterCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {card.label}
              </p>
              <p
                className="mt-1.5 text-2xl font-semibold tracking-tight"
                style={{ color: card.accent }}
              >
                {formatNumber(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ErrorBoundary fallbackTitle="The data stream crashed">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <LogConsole
              lines={logs}
              running={isScraping}
              emptyHint="Run a scrape to begin streaming records…"
              className="h-[460px]"
            />
          </div>

          <Card className="xl:col-span-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-[#1F2937] px-5 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-100">
                    Records
                  </h3>
                  <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-xs text-gray-400">
                    {formatNumber(records.length)}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  glow={selected.size > 0 ? "emerald" : "none"}
                  onClick={traceSelected}
                  disabled={selected.size === 0 || batchTracing}
                >
                  {batchTracing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="h-3.5 w-3.5" />
                  )}
                  Skip Trace selected ({selected.size})
                </Button>
              </div>

              <div className="max-h-[404px] overflow-auto">
                {records.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-gray-500">
                    No records yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#111827]">
                      <tr className="border-b border-[#1F2937] text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-5 py-3 font-medium">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            aria-label="Select all records"
                            className="h-4 w-4 cursor-pointer accent-[#10B981]"
                          />
                        </th>
                        <th className="py-3 pr-4 font-medium">Address</th>
                        <th className="py-3 pr-4 font-medium">Type</th>
                        <th className="py-3 pr-4 font-medium">Owner</th>
                        <th className="py-3 pr-4 font-medium">Status</th>
                        <th className="py-3 pr-5 font-medium text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => {
                        const traced =
                          record.status === "SKIP_TRACED" && !record.tracing;
                        return (
                          <tr
                            key={record.id}
                            className="border-b border-[#1F2937]/60 last:border-0"
                          >
                            <td className="px-5 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={selected.has(record.id)}
                                onChange={() => toggleSelect(record.id)}
                                aria-label={`Select ${record.address}`}
                                className="h-4 w-4 cursor-pointer accent-[#10B981]"
                              />
                            </td>
                            <td className="py-3 pr-4 align-top">
                              <p className="font-medium text-gray-200">
                                {record.address}
                              </p>
                              <p className="text-xs text-gray-500">
                                {record.city}, {record.state} {record.zip}
                              </p>
                            </td>
                            <td className="py-3 pr-4 align-top text-gray-400">
                              {record.propertyType}
                              {record.zoning ? (
                                <span className="ml-1 text-xs text-gray-600">
                                  ({record.zoning})
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4 align-top">
                              {record.ownerName ? (
                                <div>
                                  <p className="text-gray-200">
                                    {record.ownerName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {record.ownerPhone}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-600">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 align-top">
                              <StatusBadge status={record.status} />
                            </td>
                            <td className="py-3 pr-5 align-top text-right">
                              {traced ? (
                                <span className="text-xs text-gray-600">
                                  Traced
                                </span>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => traceOne(record.id)}
                                  disabled={record.tracing}
                                >
                                  {record.tracing ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Crosshair className="h-3.5 w-3.5" />
                                  )}
                                  Skip Trace
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </ErrorBoundary>
    </div>
  );
}
