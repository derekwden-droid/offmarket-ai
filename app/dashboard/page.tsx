import { ErrorBoundary } from "@/components/error-boundary";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";

/**
 * Overview route. The KPI dashboard is now a client component driven by
 * TanStack Query (see `OverviewDashboard` + `useDashboardData`); the initial
 * payload is seeded server-side in the dashboard layout for a flash-free paint.
 */
export default function OverviewPage() {
  return (
    <ErrorBoundary fallbackTitle="The overview failed to render">
      <OverviewDashboard />
    </ErrorBoundary>
  );
}
