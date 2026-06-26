-- Phase 4 — Compliance backbone
-- Adds the ComplianceConfig singleton (sender identity, quiet hours, frequency
-- cap, consent-text version, global kill switch) and an audit `detail` column on
-- the Suppression ledger. The Channel / SuppressionReason / MessageDirection /
-- ConversationState enums and the ConsentRecord / Suppression / Conversation /
-- Message tables already exist (Phase 1).

-- AlterTable
ALTER TABLE "Suppression" ADD COLUMN "detail" TEXT;

-- CreateTable
CREATE TABLE "ComplianceConfig" (
    "id" TEXT NOT NULL,
    "sendingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "businessName" TEXT NOT NULL,
    "physicalAddress" TEXT NOT NULL,
    "supportEmail" TEXT NOT NULL,
    "smsFromNumber" TEXT,
    "quietHoursStart" INTEGER NOT NULL DEFAULT 8,
    "quietHoursEnd" INTEGER NOT NULL DEFAULT 20,
    "dailyCapPerRecipient" INTEGER NOT NULL DEFAULT 3,
    "consentTextVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceConfig_pkey" PRIMARY KEY ("id")
);
