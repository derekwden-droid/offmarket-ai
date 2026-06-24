import {
  getDashboardStats,
  getRecentProperties,
  getSidebarCounts,
} from "@/lib/data";
import { SidebarProvider } from "@/components/dashboard/sidebar-provider";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { DashboardDataProvider } from "@/lib/hooks/use-dashboard-data";

// Reads live data on every request; never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch the full payload server-side so the first client paint has real
  // numbers; TanStack Query then refetches live in the background.
  const [stats, recent, sidebar] = await Promise.all([
    getDashboardStats(),
    getRecentProperties(),
    getSidebarCounts(),
  ]);

  const initial = {
    stats,
    sidebar,
    recent: recent.map((property) => ({
      ...property,
      createdAt: property.createdAt.toISOString(),
    })),
  };

  return (
    <DashboardDataProvider initial={initial}>
      <SidebarProvider>
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </SidebarProvider>
    </DashboardDataProvider>
  );
}
