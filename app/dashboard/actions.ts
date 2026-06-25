"use server";

import {
  getDashboardStats,
  getRecentProperties,
  getSidebarCounts,
} from "@/lib/data";
import type { DashboardPayloadDTO } from "@/lib/hooks/use-dashboard-data";

/**
 * Server action backing the live Overview dashboard.
 *
 * The browser cannot safely hold the `INTERNAL_API_SECRET`, so the UI reads its
 * metrics through this server action instead of the now-protected
 * `GET /api/stats` route. It runs on the server, calls the data-access helpers
 * directly (which degrade gracefully on a DB outage), and serializes `Date`
 * fields to ISO strings to match the client DTO.
 */
export async function fetchDashboardData(): Promise<DashboardPayloadDTO> {
  const [stats, recent, sidebar] = await Promise.all([
    getDashboardStats(),
    getRecentProperties(),
    getSidebarCounts(),
  ]);

  return {
    stats,
    sidebar,
    recent: recent.map((property) => ({
      ...property,
      createdAt: property.createdAt.toISOString(),
    })),
  };
}
