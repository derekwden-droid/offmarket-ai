"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/dashboard/sidebar-provider";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/scrape": "Data Acquisition",
  "/dashboard/outreach": "AI Qualification",
  "/dashboard/packages": "List Packages",
};

function resolveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES)
    .filter((key) => key !== "/dashboard")
    .find((key) => pathname.startsWith(key));
  return match ? TITLES[match] : "Dashboard";
}

export function Header() {
  const pathname = usePathname();
  const { toggle } = useSidebar();
  const title = resolveTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#1F2937] bg-[#0B0F19]/70 px-4 backdrop-blur-xl lg:px-8">
      <button
        type="button"
        onClick={toggle}
        className="rounded-md p-2 text-gray-400 transition-colors hover:bg-[#111827] hover:text-gray-200 lg:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="text-sm font-semibold tracking-tight text-gray-100">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-2 rounded-full border border-[#1F2937] bg-[#111827] px-3 py-1.5">
        <span className="om-pulse relative flex h-2 w-2">
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: "#10B981" }}
          />
        </span>
        <span className="text-xs font-medium text-gray-300">Scraper online</span>
      </div>
    </header>
  );
}
