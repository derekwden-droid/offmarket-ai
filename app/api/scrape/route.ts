import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, handleRouteError } from "@/lib/api";
import { scrapeRequestSchema, type ScrapePropertyInput } from "@/lib/validations";

// Prisma requires the Node.js runtime (it is not Edge-compatible).
export const runtime = "nodejs";

function keyOf(property: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return `${property.address}|${property.city}|${property.state}|${property.zip}`;
}

/**
 * POST /api/scrape
 * Ingest a batch of scraped properties, de-duplicating against the composite
 * (address, city, state, zip) identity. Optionally connect the full matched set
 * to an existing ListPackage.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { properties, listPackageId } = scrapeRequestSchema.parse(body);

    const existing = await prisma.property.findMany({
      where: {
        OR: properties.map((property) => ({
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
        })),
      },
      select: { address: true, city: true, state: true, zip: true },
    });

    const existingKeys = new Set(existing.map(keyOf));
    const seen = new Set<string>();
    const toCreate: ScrapePropertyInput[] = [];

    for (const property of properties) {
      const key = keyOf(property);
      if (existingKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      toCreate.push(property);
    }

    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.property.createMany({
        data: toCreate.map((property) => ({
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
          propertyType: property.propertyType,
          zoning: property.zoning,
          scrapeSource: property.scrapeSource,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    let connectedToPackage = 0;
    if (listPackageId) {
      const matched = await prisma.property.findMany({
        where: {
          OR: properties.map((property) => ({
            address: property.address,
            city: property.city,
            state: property.state,
            zip: property.zip,
          })),
        },
        select: { id: true },
      });

      if (matched.length > 0) {
        await prisma.listPackage.update({
          where: { id: listPackageId },
          data: {
            properties: {
              connect: matched.map((property) => ({ id: property.id })),
            },
          },
        });
        connectedToPackage = matched.length;
      }
    }

    return ok({
      received: properties.length,
      created,
      duplicates: properties.length - created,
      connectedToPackage,
    });
  } catch (error) {
    // Surface a precise 404 when an invalid listPackageId is supplied.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return handleRouteError(error);
    }
    return handleRouteError(error);
  }
}
