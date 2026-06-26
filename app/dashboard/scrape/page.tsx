"use client";

import * as React from "react";
import Link from "next/link";
import { Radar, Play, Loader2, Users, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/error-boundary";
import { LogConsole, type LogLine, type LogKind } from "@/components/dashboard/log-console";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/utils";
import { DASHBOARD_QUERY_KEY } from "@/lib/hooks/use-dashboard-data";
import {
  runScrapeIngestAction,
  type ScrapeIngestResult,
} from "@/app/dashboard/scrape/actions";
import type { IngestedPropertyRow } from "@/lib/services/scrape";

/*
 * Live acquisition: "Run scrape" pulls normalized records from the licensed
 * property-data provider (real provider when PROPERTY_DATA_API_URL/KEY are set,
 * otherwise a deterministic simulation) and ingests them as RAW leads through
 * the idempotent ingest service. De-duplication is on (address, city, state,
 * zip). Skip tracing happens on the dedicated Skip Trace workspace.
 */

const STATES = ["FL", "TX", "GA", "NC", "TN", "AZ"];
const TYPES = ["Land", "Single-Family", "Multi-Family", "Commercial"];
const SOURCES: { label: string; slug: string }[] = [
  { label: "County Records", slug: "county-records" },
  { label: "Tax Delinquent", slug: "tax-delinquent" },
  { label: "Probate Filing", slug: "probate-filing" },
  { label: "Code Violations", slug: "code-violations" },
  { label: "Licensed Provider", slug: "licensed-provider" },
];

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

export default function ScrapePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [state, setState] = React.useState("FL");
  const [propertyType, setPropertyType] = React.useState("ALL");
  const [source, setSource] = React.useState("ALL");
  const [limit, setLimit] = React.useState(25);

  const [records, setRecords] = React.useState<IngestedPropertyRow[]>([]);
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [running, setRunning] = React.useState(false);
  const [counters, setCounters] = React.useState({
    received: 0,
    created: 0,
    duplicates: 0,
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

  async function runScrape() {
    if (running) return;
    setRunning(true);
    setRecords([]);
    setLogs([]);
    setCounters({ received: 0, created: 0, duplicates: 0 });

    const sourceLabel =
      source === "ALL"
        ? "all licensed sources"
        : SOURCES.find((item) => item.slug === source)?.label ?? source;
    const filterNote = [
      state !== "ALL" ? `state=${state}` : null,
      propertyType !== "ALL" ? `type=${propertyType}` : null,
      `source=${sourceLabel}`,
    ]
      .filter(Boolean)
      .join(", ");

    pushLog("info", `Pulling ${clampLimit(limit)} records (${filterNote})…`);

    try {
      const result: ScrapeIngestResult = await runScrapeIngestAction({
        state,
        propertyType,
        source: source === "ALL" ? undefined : source,
        limit: clampLimit(limit),
      });

      setRecords(result.rows);
      setCounters({
        received: result.summary.received,
        created: result.summary.created,
        duplicates: result.summary.duplicates,
      });

      pushLog(
        "data",
        `Provider returned ${result.summary.received} records.`,
      );
      if (result.summary.duplicates > 0) {
        pushLog(
          "warn",
          `${result.summary.duplicates} already on file — skipped.`,
        );
      }
      pushLog(
        "success",
        `Ingested ${result.summary.created} new RAW leads.`,
      );

      // Refresh dashboard KPIs and the skip-trace queue with the new rows.
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["skip-trace", "properties"] });

      toast({
        title: "Scrape complete",
        description: `${formatNumber(result.summary.created)} new properties ingested (${formatNumber(result.summary.duplicates)} duplicates).`,
        variant: result.summary.created > 0 ? "success" : "warning",
      });
    } catch {
      pushLog("error", "Ingestion failed. Check the provider config and logs.");
      toast({
        title: "Scrape failed",
        description: "The provider pull or ingest did not complete.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  }

  const counterCards = [
    { label: "Received", value: counters.received, accent: "#9CA3AF" },
    { label: "New (RAW)", value: counters.created, accent: "#10B981" },
    { label: "Duplicates", value: counters.duplicates, accent: "#F59E0B" },
  ];

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
                disabled={running}
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
                disabled={running}
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
                disabled={running}
              >
                <option value="ALL">All sources</option>
                {SOURCES.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
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
                onChange={(event) => setLimit(clampLimit(Number(event.target.value)))}
                disabled={running}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="ai" glow="cyber" onClick={runScrape} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run scrape
            </Button>
            {running ? (
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Pulling &amp; ingesting…
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
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

      <ErrorBoundary fallbackTitle="The acquisition feed crashed">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <LogConsole
              lines={logs}
              running={running}
              emptyHint="Run a scrape to pull and ingest records…"
              className="h-[460px]"
            />
          </div>

          <Card className="xl:col-span-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-[#1F2937] px-5 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-100">
                    Ingested records
                  </h3>
                  <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-xs text-gray-400">
                    {formatNumber(records.length)}
                  </span>
                </div>
                <Link href="/dashboard/skip-trace">
                  <Button variant="outline" size="sm">
                    Skip Trace queue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>

              <div className="max-h-[404px] overflow-auto">
                {records.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-gray-500">
                    No records yet. Run a scrape to ingest leads.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#111827]">
                      <tr className="border-b border-[#1F2937] text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-5 py-3 font-medium">Address</th>
                        <th className="py-3 pr-4 font-medium">Type</th>
                        <th className="py-3 pr-5 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr
                          key={record.id}
                          className="border-b border-[#1F2937]/60 last:border-0"
                        >
                          <td className="px-5 py-3 align-top">
                            <p className="font-medium text-gray-200">
                              {record.address}
                            </p>
                            <p className="text-xs text-gray-500">
                              {record.city}, {record.state} {record.zip}
                            </p>
                          </td>
                          <td className="py-3 pr-4 align-top text-gray-400">
                            {record.propertyType}
                          </td>
                          <td className="py-3 pr-5 align-top text-right">
                            <StatusBadge status={record.status} />
                          </td>
                        </tr>
                      ))}
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
