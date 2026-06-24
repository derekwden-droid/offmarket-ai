import "server-only";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Server-only data-access helpers for the dashboard. Each function is wrapped
 * so that a database outage degrades gracefully (the UI renders an empty/zeroed
 * state with `available: false`) instead of throwing during a server render.
 */

/** A fully-zeroed status map, used as a safe default. */
export const EMPTY_STATUS: Record<LeadStatus, number> = {
  [LeadStatus.RAW]: 0,
  [LeadStatus.SKIP_TRACED]: 0,
  [LeadStatus.AI_CONTACTED]: 0,
  [LeadStatus.QUALIFIED]: 0,
  [LeadStatus.COLD]: 0,
};

export interface DashboardStats {
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

export interface RecentProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  propertyType: string;
  scrapeSource: string;
  status: LeadStatus;
  createdAt: Date;
}

export interface SidebarCounts {
  properties: number;
  contacted: number;
  packages: number;
}

export interface ListPackageSummary {
  id: string;
  name: string;
  description: string;
  price: number;
  propertyCount: number;
  createdAt: Date;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const [total, grouped, attempted, hits, qualified, packageAgg] =
      await Promise.all([
        prisma.property.count(),
        prisma.property.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.property.count({ where: { status: { not: LeadStatus.RAW } } }),
        prisma.property.count({
          where: {
            OR: [
              { ownerPhone: { not: null } },
              { ownerEmail: { not: null } },
            ],
          },
        }),
        prisma.property.count({ where: { status: LeadStatus.QUALIFIED } }),
        prisma.listPackage.aggregate({
          _count: { _all: true },
          _sum: { price: true },
        }),
      ]);

    const byStatus: Record<LeadStatus, number> = { ...EMPTY_STATUS };
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
    }

    return {
      available: true,
      total,
      byStatus,
      attempted,
      hits,
      hitRate: attempted > 0 ? hits / attempted : 0,
      qualified,
      packageCount: packageAgg._count._all,
      packageRevenue: packageAgg._sum.price ?? 0,
    };
  } catch (error) {
    console.error("getDashboardStats failed:", error);
    return {
      available: false,
      total: 0,
      byStatus: { ...EMPTY_STATUS },
      attempted: 0,
      hits: 0,
      hitRate: 0,
      qualified: 0,
      packageCount: 0,
      packageRevenue: 0,
    };
  }
}

export async function getRecentProperties(): Promise<RecentProperty[]> {
  try {
    return await prisma.property.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        propertyType: true,
        scrapeSource: true,
        status: true,
        createdAt: true,
      },
    });
  } catch (error) {
    console.error("getRecentProperties failed:", error);
    return [];
  }
}

export async function getSidebarCounts(): Promise<SidebarCounts> {
  try {
    const [properties, contacted, packages] = await Promise.all([
      prisma.property.count(),
      prisma.property.count({ where: { status: LeadStatus.AI_CONTACTED } }),
      prisma.listPackage.count(),
    ]);
    return { properties, contacted, packages };
  } catch (error) {
    console.error("getSidebarCounts failed:", error);
    return { properties: 0, contacted: 0, packages: 0 };
  }
}

export async function getListPackages(): Promise<ListPackageSummary[]> {
  try {
    const packages = await prisma.listPackage.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { properties: true } } },
    });
    return packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      price: pkg.price,
      propertyCount: pkg._count.properties,
      createdAt: pkg.createdAt,
    }));
  } catch (error) {
    console.error("getListPackages failed:", error);
    return [];
  }
}
