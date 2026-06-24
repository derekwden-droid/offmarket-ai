import { getSidebarCounts } from "@/lib/data";
import { SidebarProvider } from "@/components/dashboard/sidebar-provider";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";

// Reads live counts on every request; never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const counts = await getSidebarCounts();

  return (
    <SidebarProvider>
      <Sidebar counts={counts} />
      <div className="lg:pl-64">
        <Header />
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </SidebarProvider>
  );
}
