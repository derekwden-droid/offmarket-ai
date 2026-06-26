-- Phase 5 — Live outreach engine
-- Adds the draft-for-approval queue (AgentDraft + DraftStatus) and a per-
-- conversation pause flag. The ConversationState / Channel enums already exist.

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentDraft" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "body" TEXT NOT NULL,
    "proposedState" "ConversationState" NOT NULL,
    "reasoning" TEXT,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "providerSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AgentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDraft_status_idx" ON "AgentDraft"("status");

-- CreateIndex
CREATE INDEX "AgentDraft_conversationId_idx" ON "AgentDraft"("conversationId");

-- AddForeignKey
ALTER TABLE "AgentDraft" ADD CONSTRAINT "AgentDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
