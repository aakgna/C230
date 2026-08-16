"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";

const completeModuleSchema = z.object({ moduleId: z.uuid() });

export async function recordTrainingCompletion(formData: FormData) {
  const ctx = await requireFirmContext();
  const { moduleId } = completeModuleSchema.parse({ moduleId: formData.get("moduleId") });

  const db = getDb();

  const [module] = await db
    .select({ id: schema.trainingModules.id })
    .from(schema.trainingModules)
    .where(and(eq(schema.trainingModules.id, moduleId), eq(schema.trainingModules.isActive, true)))
    .limit(1);
  if (!module) {
    throw new Error("Training module not found");
  }

  await db
    .insert(schema.trainingCompletions)
    .values({ firmId: ctx.firmId, userId: ctx.userId, moduleId, completedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.trainingCompletions.userId, schema.trainingCompletions.moduleId],
      set: { completedAt: new Date() },
    });

  revalidatePath("/training");
  revalidatePath(`/training/${moduleId}`);
}
