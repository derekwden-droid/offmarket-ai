"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  LayoutDashboard,
  Radar,
  Crosshair,
  Bot,
  Package,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useSidebar } from "@/components/dashboard/sidebar-provider";
import {
  useDashboardData,
  type SidebarCountsDTO,
} from "@/lib/hooks/use-dashboard-data";

type Accent = "neutral" | "cyber" | "emerald";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  accent: Accent;
  badge?: number;
  exact?: boolean;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const ACCENT_ACTIVE: Record<Accent, string> = {
  neutral: "#E5E7EB",
  cyber: "#3B82F6",
  emerald: "#10B981",
};

const EMPTY_COUNTS: SidebarCountsDTO = {
  properties: 0,
  contacted: 0,
  packages: 0,
};

function buildGroups(counts: SidebarCountsDTO): NavGroup[] {
  return [
    {
      heading: "Workspace",
      items: [
        {
          label: "Overview",
          href: "/dashboard",
          icon: LayoutDashboard,
          accent: "neutral",
          exact: true,
        },
        {
          label: "Scrape",
          href: "/dashboard/scrape",
          icon: Radar,
          accent: "cyber",
          badge: counts.properties,
        },
        {
          label: "Skip Trace",
          href: "/dashboard/skip-trace",
          icon: Crosshair,
          accent: "cyber",
        },
        {
          label: "Outreach",
          href: "/dashboard/outreach",
          icon: Bot,
          accent: "emerald",
          badge: counts.contacted,
        },
      ],
    },
    {
      heading: "Governance",
      items: [
        {
          label: "Compliance",
          href: "/dashboard/compliance",
          icon: ShieldCheck,
          accent: "emerald",
        },
      ],
    },
    {
      heading: "Catalog",
      items: [
        {
          label: "Packages",
          href: "/dashboard/packages",
          icon: Package,
          accent: "emerald",
          badge: counts.packages,
        },
      ],
    },
  ];
}

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  // Live counts via TanStack Query, seeded with the server-rendered payload
  // (see DashboardDataProvider) so the badges never flash zeros on first paint.
  const { data } = useDashboardData();
  const counts = data?.sidebar ?? EMPTY_COUNTS;
  const groups = buildGroups(counts);

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          aria-hidden="true"
          onClick={close}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#1F2937] bg-[#0B0F19]",
          "transition-transform duration-200 ease-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#1F2937] px-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                backgroundColor: "rgba(16,185,129,0.12)",
                boxShadow: "0 0 15px rgba(16,185,129,0.25)",
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "#10B981" }} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-gray-100">
              OffMarket<span style={{ color: "#10B981" }}>.AI</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-[#1F2937] hover:text-gray-200 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {groups.map((group) => (
            <div key={group.heading}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
                {group.heading}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  const accent = ACCENT_ACTIVE[item.accent];

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-[#111827] text-gray-100"
                            : "text-gray-400 hover:bg-[#111827] hover:text-gray-200",
                        )}
                      >
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={{ color: isActive ? accent : undefined }}
                        />
                        <span className="flex-1">{item.label}</span>
                        {typeof item.badge === "number" && item.badge > 0 ? (
                          <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-[11px] font-medium text-gray-300">
                            {formatNumber(item.badge)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[#1F2937] px-5 py-4">
          <p className="text-[11px] leading-relaxed text-gray-600">
            Deal intelligence workspace
          </p>
        </div>
      </aside>
    </>
  );
}
