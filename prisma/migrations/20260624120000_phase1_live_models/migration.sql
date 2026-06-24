-- Phase 1 — Live data layer: consent, suppression, conversations, messages,
-- skip-trace jobs, and persisted agent config.
--
-- This migration is INCREMENTAL: it assumes the Property and ListPackage tables
-- (and the LeadStatus enum) already exist in the target database. Apply it on top
-- of the existing schema. No existing rows are modified.

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('STOP', 'DNC', 'BOUNCE', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'COLD', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "SkipTraceJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'NEW',
    "assignedNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "providerSid" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkipTraceJob" (
    "id" TEXT NOT NULL,
    "status" "SkipTraceJobStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SkipTraceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "objectives" TEXT[],
    "channels" "Channel"[],
    "scriptTemplate" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_propertyId_idx" ON "ConsentRecord"("propertyId");

-- CreateIndex
CREATE INDEX "ConsentRecord_channel_idx" ON "ConsentRecord"("channel");

-- CreateIndex
CREATE INDEX "Suppression_value_idx" ON "Suppression"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_value_channel_key" ON "Suppression"("value", "channel");

-- CreateIndex
CREATE INDEX "Conversation_propertyId_idx" ON "Conversation"("propertyId");

-- CreateIndex
CREATE INDEX "Conversation_state_idx" ON "Conversation"("state");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_providerSid_idx" ON "Message"("providerSid");

-- CreateIndex
CREATE INDEX "SkipTraceJob_status_idx" ON "SkipTraceJob"("status");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
