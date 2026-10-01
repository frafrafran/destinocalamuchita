import "server-only";
import type { ActorType, Prisma } from "@/generated/prisma/client";
import type { Db } from "./db";

export interface AuditActor {
  type: ActorType;
  id?: string | null;
  ip?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { type: "SYSTEM" };

export async function audit(
  db: Db,
  actor: AuditActor,
  action: string,
  entity: { type: string; id?: string | null },
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: actor.type,
      actorId: actor.type === "USER" ? (actor.id ?? null) : null,
      ip: actor.ip ?? null,
      action,
      entityType: entity.type,
      entityId: entity.id ?? null,
      metadata: metadata ?? undefined,
    },
  });
}
