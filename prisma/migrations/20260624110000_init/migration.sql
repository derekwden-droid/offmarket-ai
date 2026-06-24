-- Baseline schema: the pre-existing Property + ListPackage models and the
-- LeadStatus enum. This migration captures the schema state that predates the
-- Phase 1 live-system additions, so `prisma migrate deploy` can build a fresh
-- database from scratch (init -> phase1) in order.

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('RAW', 'SKIP_TRACED', 'AI_CONTACTED', 'QUALIFIED', 'COLD');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "zoning" TEXT,
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "scrapeSource" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'RAW',
    "aiNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable (implicit many-to-many join: Property <-> ListPackage)
CREATE TABLE "_ListToProperties" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Property_status_idx" ON "Property"("status");

-- CreateIndex
CREATE INDEX "Property_state_idx" ON "Property"("state");

-- CreateIndex
CREATE INDEX "Property_scrapeSource_idx" ON "Property"("scrapeSource");

-- CreateIndex
CREATE INDEX "Property_createdAt_idx" ON "Property"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "property_location" ON "Property"("address", "city", "state", "zip");

-- CreateIndex
CREATE UNIQUE INDEX "_ListToProperties_AB_unique" ON "_ListToProperties"("A", "B");

-- CreateIndex
CREATE INDEX "_ListToProperties_B_index" ON "_ListToProperties"("B");

-- AddForeignKey
ALTER TABLE "_ListToProperties" ADD CONSTRAINT "_ListToProperties_A_fkey" FOREIGN KEY ("A") REFERENCES "ListPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ListToProperties" ADD CONSTRAINT "_ListToProperties_B_fkey" FOREIGN KEY ("B") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
