"use client";

import * as React from "react";
import Link from "next/link";
import { LeadStatus } from "@prisma/client";
import {
  Building2,
  Crosshair,
  BadgeCheck,
  DollarSign,
  Radar,
  Bot,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import {
  useDashboardData,
  type DashboardStatsDTO,
  type RecentPropertyDTO,
} from "@/lib/hooks/use-dashboard-data";

interface PipelineSegment {
  status: LeadStatus;
  label: string;
  color: string;
}

// Full LeadStatus pipeline: RAW -> SKIP_TRACED -> AI_CONTACTED -> QUALIFIED / COLD.
const PIPELINE: PipelineSegment[] = [
  { status: LeadStatus.RAW, label: "Raw", color: "#9CA3AF" },
  { status: LeadStatus.SKIP_TRACED, label: "Skip-Traced", color: "#3B82F6" },
  { status: LeadStatus.AI_CONTACTED, label: "AI Contacted", color: "#8B5CF6" },
  { status: LeadStatus.QUALIFIED, label: "Qualified", color: "#10B981" },
  { status: LeadStatus.COLD, label: "Cold", color: "#F43F5E" },
];

interface StatConfig {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
}

function StatCard({ stat }: { stat: StatConfig }) {
  const Icon = stat.icon;
  return (
    <Card>
      <CardContent className="p-5 pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-100">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-gray-500">{stat.hint}</p>
          </div>
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${stat.accent}1F` }}
          >
            <Icon className="h-5 w-5" style={{ color: stat.accent }} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 pt-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

function buildStatCards(stats: DashboardStatsDTO): StatConfig[] {
  return [
    {
      label: "Total Properties",
      value: formatNumber(stats.total),
      hint: "Across all sources",
      icon: Building2,
      accent: "#9CA3AF",
    },
    {
      label: "Skip-Trace Hit Rate",
      value: formatPercent(stats.hitRate),
      hint: `${formatNumber(stats.hits)} of ${formatNumber(stats.attempted)} attempted`,
      icon: Crosshair,
      accent: "#3B82F6",
    },
    {
      label: "Qualified Leads",
      value: formatNumber(stats.qualified),
      hint: "Ready for handoff",
      icon: BadgeCheck,
      accent: "#10B981",
    },
    {
      label: "Package Revenue",
      value: formatCurrency(stats.packageRevenue),
      hint: `${formatNumber(stats.packageCount)} list packages`,
      icon: DollarSign,
      accent: "#10B981",
    },
  ];
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lead Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent Properties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(244,63,94,0.12)" }}
        >
          <AlertTriangle className="h-5 w-5" style={{ color: "#F43F5E" }} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-100">
            Could not load dashboard metrics
          </p>
          <p className="mt-1 max-w-md text-sm text-gray-500">{message}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw
            className={isRetrying ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function RecentTable({ recent }: { recent: RecentPropertyDTO[] }) {
  if (recent.length === 0) {
    return (
      <p className="text-sm text-gray-500">No properties to display yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1F2937] text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="pb-3 pr-4 font-medium">Address</th>
            <th className="pb-3 pr-4 font-medium">Type</th>
            <th className="pb-3 pr-4 font-medium">State</th>
            <th className="pb-3 pr-4 font-medium">Source</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((property) => (
            <tr
              key={property.id}
              className="border-b border-[#1F2937]/60 last:border-0"
            >
              <td className="py-3 pr-4">
                <p className="font-medium text-gray-200">{property.address}</p>
                <p className="text-xs text-gray-500">
                  {property.city}, {property.state}
                </p>
              </td>
              <td className="py-3 pr-4 text-gray-400">
                {property.propertyType}
              </td>
              <td className="py-3 pr-4 text-gray-400">{property.state}</td>
              <td className="py-3 pr-4 text-gray-400">
                {property.scrapeSource}
              </td>
              <td className="py-3">
                <StatusBadge status={property.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Live Overview dashboard. Reads `GET /api/stats` through TanStack Query
 * (`useDashboardData`), seeded with the server-rendered payload for a flash-free
 * first paint and refetched on an interval. Renders skeletons before data is
 * available and a recoverable error state on fetch failure.
 */
export function OverviewDashboard() {
  const query = useDashboardData();

  if (query.isPending) {
    return <LoadingState />;
  }

  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  }

  const { stats, recent } = query.data;
  const statCards = buildStatCards(stats);
  const pipelineTotal = PIPELINE.reduce(
    (sum, segment) => sum + stats.byStatus[segment.status],
    0,
  );

  return (
    <div className="space-y-6">
      {!stats.available ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "rgba(245,158,11,0.30)",
            backgroundColor: "rgba(245,158,11,0.08)",
            color: "#FCD34D",
          }}
        >
          The database is unreachable, so metrics are showing zeroes. Verify
          <code className="mx-1 rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
            DATABASE_URL
          </code>
          and run the Prisma migration to get started.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lead Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {pipelineTotal === 0 ? (
            <p className="text-sm text-gray-500">
              No properties yet. Run a scrape to populate the pipeline.
            </p>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#0B0F19]">
                {PIPELINE.map((segment) => {
                  const count = stats.byStatus[segment.status];
                  const width =
                    pipelineTotal > 0 ? (count / pipelineTotal) * 100 : 0;
                  if (width === 0) return null;
                  return (
                    <div
                      key={segment.status}
                      style={{
                        width: `${width}%`,
                        backgroundColor: segment.color,
                      }}
                      title={`${segment.label}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {PIPELINE.map((segment) => (
                  <div key={segment.status} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-sm text-gray-400">
                      {segment.label}
                    </span>
                    <span className="ml-auto text-sm font-medium text-gray-200">
                      {formatNumber(stats.byStatus[segment.status])}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Link
          href="/dashboard/scrape"
          className="group flex items-center justify-between rounded-xl border border-[#1F2937] bg-[#111827] p-5 transition-colors hover:border-[#3B82F6]/50"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(59,130,246,0.12)" }}
            >
              <Radar className="h-5 w-5" style={{ color: "#3B82F6" }} />
            </span>
            <div>
              <p className="text-sm font-medium text-gray-100">
                Acquire properties
              </p>
              <p className="text-xs text-gray-500">
                Scrape new off-market records
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-300" />
        </Link>

        <Link
          href="/dashboard/outreach"
          className="group flex items-center justify-between rounded-xl border border-[#1F2937] bg-[#111827] p-5 transition-colors hover:border-[#10B981]/50"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
            >
              <Bot className="h-5 w-5" style={{ color: "#10B981" }} />
            </span>
            <div>
              <p className="text-sm font-medium text-gray-100">Qualify leads</p>
              <p className="text-xs text-gray-500">
                Launch the AI outreach agent
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-300" />
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentTable recent={recent} />
        </CardContent>
      </Card>
    </div>
  );
}
