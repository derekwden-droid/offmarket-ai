"use client";

import * as React from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { LeadStatus } from "@prisma/client";
import { fetchDashboardData } from "@/app/dashboard/actions";

/**
 * Client-side dashboard metrics, fetched via the `fetchDashboardData` server
 * action and cached by TanStack Query. Dates are serialized to ISO strings over
 * the wire, so the client DTOs use `string` where the server helpers use `Date`.
 */

export interface DashboardStatsDTO {
  available: boolean;
  total: number;
  byStatus: Record<LeadStatus, number>;
  attempted: number;
  hits: number;
  hitRate: number;
  qualified: number;
  packageCount: number;
  packageRevenue: number;
}

export interface RecentPropertyDTO {
  id: string;
  address: string;
  city: string;
  state: string;
  propertyType: string;
  scrapeSource: string;
  status: LeadStatus;
  createdAt: string;
}

export interface SidebarCountsDTO {
  properties: number;
  contacted: number;
  packages: number;
}

export interface DashboardPayloadDTO {
  stats: DashboardStatsDTO;
  recent: RecentPropertyDTO[];
  sidebar: SidebarCountsDTO;
}

/** Stable query key shared by the Overview dashboard and the sidebar counters. */
export const DASHBOARD_QUERY_KEY = ["dashboard", "metrics"] as const;

/**
 * React context that carries the server-rendered initial payload down to every
 * consumer, so the first client paint has real numbers (no flash of zeros)
 * while TanStack Query refetches live in the background.
 */
const InitialDashboardContext = React.createContext<
  DashboardPayloadDTO | undefined
>(undefined);

export function DashboardDataProvider({
  initial,
  children,
}: {
  initial?: DashboardPayloadDTO;
  children: React.ReactNode;
}) {
  return (
    <InitialDashboardContext.Provider value={initial}>
      {children}
    </InitialDashboardContext.Provider>
  );
}

/** Read the server-provided initial payload (undefined when unavailable). */
export function useInitialDashboard(): DashboardPayloadDTO | undefined {
  return React.useContext(InitialDashboardContext);
}

/**
 * Live dashboard query. Seeds from the server-rendered initial payload when
 * present and refetches every 30s (and on reconnect) for fresh counts.
 */
export function useDashboardData(): UseQueryResult<DashboardPayloadDTO, Error> {
  const initialData = useInitialDashboard();

  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboardData,
    initialData,
    refetchInterval: 30_000,
    refetchOnReconnect: true,
  });
}
