import "server-only";
import { prisma } from "@/lib/prisma";
import type { ComplianceConfigInput } from "@/lib/validations";

/**
 * Compliance-config service.
 *
 * Single active configuration (sender identity, quiet hours, frequency cap,
 * consent-text version, and the global kill switch). Modeled as a table for an
 * audit trail; exposed as a single row (latest wins), mirroring AgentConfig.
 * The send-time gate reads this every evaluation, so changes take effect on the
 * next send with no redeploy.
 */

export async function getComplianceConfig() {
  return prisma.complianceConfig.findFirst({ orderBy: { updatedAt: "desc" } });
}

/** Persist the compliance configuration (updates the active row, or creates it). */
export async function saveComplianceConfig(input: ComplianceConfigInput) {
  const existing = await prisma.complianceConfig.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const data = {
    sendingEnabled: input.sendingEnabled,
    businessName: input.businessName,
    physicalAddress: input.physicalAddress,
    supportEmail: input.supportEmail,
    smsFromNumber: input.smsFromNumber ? input.smsFromNumber : null,
    quietHoursStart: input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd,
    dailyCapPerRecipient: input.dailyCapPerRecipient,
    consentTextVersion: input.consentTextVersion,
  };

  if (existing) {
    return prisma.complianceConfig.update({ where: { id: existing.id }, data });
  }
  return prisma.complianceConfig.create({ data });
}
