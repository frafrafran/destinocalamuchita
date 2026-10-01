import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";
import { cloudflare } from "./platform";

function createClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function connectionString(hyperdrive?: { connectionString: string }): string {
  const value = hyperdrive?.connectionString ?? env.DATABASE_URL;
  if (!value) throw new Error("No database configured: set DATABASE_URL or the HYPERDRIVE binding.");
  return value;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
/** One client per request in a Worker: Workers forbid sharing a socket between requests. */
const requestClients = new WeakMap<object, PrismaClient>();

function currentClient(): PrismaClient {
  const worker = cloudflare();
  if (worker) {
    let client = requestClients.get(worker.ctx);
    if (!client) {
      client = createClient(connectionString(worker.env.HYPERDRIVE));
      requestClients.set(worker.ctx, client);
    }
    return client;
  }
  // Node.js: a single pooled client per process (dev hot reload would otherwise open a pool per change).
  globalForPrisma.prisma ??= createClient(connectionString());
  return globalForPrisma.prisma;
}

/**
 * The database client. Resolved on each use, so every import site works unchanged on Node.js
 * (process-wide client) and on Cloudflare Workers (request-scoped client through Hyperdrive).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentClient();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** PostgreSQL error raised by the `Reservation_no_overlap` exclusion constraint. */
export function isExclusionViolation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
  return text.includes("23P01") || text.includes("Reservation_no_overlap");
}
