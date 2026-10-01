"use server";

import { refresh } from "next/cache";
import { type ActionResult, ActionError, runAction } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new ActionError("UNAUTHORIZED");
    await prisma.notification.updateMany({
      where: { userId: user.id, channel: "IN_APP", readAt: null, ...(ids ? { id: { in: ids.slice(0, 100) } } : {}) },
      data: { readAt: new Date() },
    });
    refresh();
    return undefined;
  });
}
