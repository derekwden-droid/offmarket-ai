import { PrismaClient } from "@prisma/client";

/**
 * Prisma must be a singleton in development to avoid exhausting database
 * connections across Next.js hot-reloads. In production a single instance is
 * created per server runtime.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
