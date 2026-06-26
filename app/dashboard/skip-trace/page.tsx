"use client";

import * as React from "react";
import { Crosshair, Loader2, RefreshCw, Users, Target } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/error-boundary";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/utils";
import { DASHBOARD_QUERY_KEY } from "@/lib/hooks/use-dashboard-data";
import {
  loadTraceablePropertiesAction,
  enqueueSkipTraceAction,
  getSkipTraceJobAction,
  type SkipTraceJobDTO,
} from "@/app/dashboard/skip-trace/actions";

const PROPERTIES_KEY = ["skip-trace", "properties"] as const;
const POLL_INTERVAL_MS = 1200;
/** Stop polling and warn after this long — the Inngest worker is likely down. */
const STALL_TIMEOUT_MS = 90_000;

function isTerminal(status: SkipTraceJobDTO["status"]): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

export default function SkipTracePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = React.useState<Set<string>>(new Set());
  const stallTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const propertiesQuery = useQuery({
    queryKey: PROPERTIES_KEY,
    queryFn: loadTraceablePropertiesAction,
    refetchOnWindowFocus: false,
  });

  const jobQuery = useQuery({
    queryKey: ["skip-trace", "job", activeJobId],
    queryFn: () => getSkipTraceJobAction(activeJobId as string),
    enabled: activeJobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && isTerminal(status)) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const clearStallTimer = React.useCallback(() => {
    if (stallTimer.current) {
      clearTimeout(stallTimer.current);
      stallTimer.current = null;
    }
  }, []);

  // React to job completion: toast, refresh queues, reset transient UI state.
  const job = jobQuery.data;
  React.useEffect(() => {
    if (!activeJobId || !job || !isTerminal(job.status)) return;

    clearStallTimer();
    if (job.status === "COMPLETED") {
      toast({
        title: "Skip trace complete",
        description: `${formatNumber(job.completed)} processed, ${formatNumber(job.failed)} failed of ${formatNumber(job.total)}.`,
        variant: job.failed > 0 ? "warning" : "success",
      });
    } else {
      toast({
        title: "Skip trace failed",
        description: "The batch did not finish. Check the worker logs and retry.",
        variant: "error",
      });
    }

    void queryClient.invalidateQueries({ queryKey: PROPERTIES_KEY });
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    setActiveJobId(null);
    setSelected(new Set());
    setSubmittedIds(new Set());
  }, [activeJobId, job, queryClient, toast, clearStallTimer]);

  React.useEffect(() => clearStallTimer, [clearStallTimer]);

  async function runTrace(ids: string[]) {
    if (ids.length === 0 || activeJobId) return;
    setSubmittedIds(new Set(ids));
    try {
      const result = await enqueueSkipTraceAction(ids);
      setActiveJobId(result.jobId);
      toast({
        title: "Batch queued",
        description: `${formatNumber(result.total)} ${result.total === 1 ? "property" : "properties"} sent to the worker.`,
        variant: "info",
      });
      clearStallTimer();
      stallTimer.current = setTimeout(() => {
        setActiveJobId((current) => {
          if (current === null) return null;
          toast({
            title: "Still queued",
            description: "The job hasn't progressed — ensure the Inngest worker is running.",
            variant: "warning",
          });
          setSubmittedIds(new Set());
          return null;
        });
      }, STALL_TIMEOUT_MS);
    } catch {
      setSubmittedIds(new Set());
      toast({
        title: "Could not queue batch",
        description: "Enqueue failed. Check the server logs and try again.",
        variant: "error",
      });
    }
  }

  function toggleSelect(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const properties = propertiesQuery.data?.properties ?? [];
  const rawTotal = propertiesQuery.data?.rawTotal ?? 0;
  const allSelected = properties.length > 0 && selected.size === properties.length;
  const busy = activeJobId !== null;

  function toggleSelectAll() {
    setSelected((previous) =>
      previous.size === properties.length
        ? new Set()
        : new Set(properties.map((property) => property.id)),
    );
  }

  const progressPct =
    job && job.total > 0
      ? Math.round(((job.completed + job.failed) / job.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4" style={{ color: "#3B82F6" }} />
              <h2 className="text-sm font-semibold text-gray-100">
                Skip Trace Queue
              </h2>
              <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-xs text-gray-400">
                {formatNumber(rawTotal)} untraced
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => propertiesQuery.refetch()}
                disabled={busy || propertiesQuery.isFetching}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${propertiesQuery.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                glow={selected.size > 0 && !busy ? "emerald" : "none"}
                onClick={() => runTrace(Array.from(selected))}
                disabled={selected.size === 0 || busy}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5" />
                )}
                Skip Trace selected ({selected.size})
              </Button>
            </div>
          </div>

          {job ? (
            <div className="mt-4 rounded-lg border border-[#1F2937] bg-[#0B0F19] p-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-gray-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#3B82F6]" />
                  Worker running — {job.status.toLowerCase()}
                </span>
                <span className="font-mono text-gray-400">
                  {formatNumber(job.completed + job.failed)}/{formatNumber(job.total)} ({progressPct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#1F2937]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%`, backgroundColor: "#10B981" }}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ErrorBoundary fallbackTitle="The skip-trace queue failed to render">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-[#1F2937] px-5 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-100">
                  Untraced properties
                </h3>
                <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-xs text-gray-400">
                  {formatNumber(properties.length)}
                </span>
              </div>
            </div>

            <div className="max-h-[520px] overflow-auto">
              {propertiesQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading queue…
                </div>
              ) : propertiesQuery.isError ? (
                <p className="px-5 py-10 text-center text-sm text-[#F43F5E]">
                  Failed to load properties.
                </p>
              ) : properties.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-500">
                  No untraced properties. Ingest leads from the Scrape workspace.
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
                          disabled={busy}
                          aria-label="Select all properties"
                          className="h-4 w-4 cursor-pointer accent-[#10B981]"
                        />
                      </th>
                      <th className="py-3 pr-4 font-medium">Address</th>
                      <th className="py-3 pr-4 font-medium">Type</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((property) => {
                      const inFlight = busy && submittedIds.has(property.id);
                      return (
                        <tr
                          key={property.id}
                          className="border-b border-[#1F2937]/60 last:border-0"
                        >
                          <td className="px-5 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={selected.has(property.id)}
                              onChange={() => toggleSelect(property.id)}
                              disabled={busy}
                              aria-label={`Select ${property.address}`}
                              className="h-4 w-4 cursor-pointer accent-[#10B981]"
                            />
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <p className="font-medium text-gray-200">
                              {property.address}
                            </p>
                            <p className="text-xs text-gray-500">
                              {property.city}, {property.state} {property.zip}
                            </p>
                          </td>
                          <td className="py-3 pr-4 align-top text-gray-400">
                            {property.propertyType}
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <StatusBadge status={property.status} />
                          </td>
                          <td className="py-3 pr-5 align-top text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => runTrace([property.id])}
                              disabled={busy}
                            >
                              {inFlight ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Crosshair className="h-3.5 w-3.5" />
                              )}
                              Skip Trace
                            </Button>
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
      </ErrorBoundary>
    </div>
  );
}
