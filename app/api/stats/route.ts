import {
  getDashboardStats,
  getRecentProperties,
  getSidebarCounts,
} from "@/lib/data";
import { ok, handleRouteError } from "@/lib/api";

// Prisma requires the Node.js runtime (it is not Edge-compatible).
export const runtime = "nodejs";
// Always read live counts; never cache at the route level.
export const dynamic = "force-dynamic";

export interface DashboardPayload {
  stats: Awaited<ReturnType<typeof getDashboardStats>>;
  recent: Awaited<ReturnType<typeof getRecentProperties>>;
  sidebar: Awaited<ReturnType<typeof getSidebarCounts>>;
}

/**
 * GET /api/stats
 * Live dashboard metrics for client-side TanStack Query consumers (the Overview
 * KPI dashboard and the sidebar counters). The underlying data-access helpers
 * degrade gracefully on a database outage (zeroed stats with `available: false`),
 * so this route returns a 200 envelope even when Postgres is unreachable.
 */
export async function GET() {
  try {
    const [stats, recent, sidebar] = await Promise.all([
      getDashboardStats(),
      getRecentProperties(),
      getSidebarCounts(),
    ]);

    return ok<DashboardPayload>(
      { stats, recent, sidebar },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
