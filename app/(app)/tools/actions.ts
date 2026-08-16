"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { updateToolStatusSchema, addCustomToolSchema } from "@/lib/validation/schemas";

export async function updateToolStatus(formData: FormData) {
  const ctx = await requireFirmContext();
  const parsed = updateToolStatusSchema.parse({
    toolId: formData.get("toolId"),
    status: formData.get("status"),
    vettingNotes: formData.get("vettingNotes") || undefined,
  });

  const db = getDb();
  // Scoped by firmId in the WHERE clause, not fetched-then-checked, so a
  // cross-firm toolId silently matches zero rows instead of leaking a write.
  const result = await db
    .update(schema.aiToolRegister)
    .set({
      status: parsed.status,
      vettingNotes: parsed.vettingNotes ?? null,
      updatedBy: ctx.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.aiToolRegister.id, parsed.toolId), eq(schema.aiToolRegister.firmId, ctx.firmId)))
    .returning({ id: schema.aiToolRegister.id });

  if (result.length === 0) {
    throw new Error("Tool not found for this firm");
  }

  revalidatePath("/tools");
  revalidatePath(`/tools/${parsed.toolId}`);
}

export async function addCustomTool(formData: FormData) {
  const ctx = await requireFirmContext();
  const parsed = addCustomToolSchema.parse({
    toolName: formData.get("toolName"),
    vettingNotes: formData.get("vettingNotes") || undefined,
  });

  const db = getDb();
  await db.insert(schema.aiToolRegister).values({
    firmId: ctx.firmId,
    toolName: parsed.toolName,
    vettingNotes: parsed.vettingNotes ?? null,
    status: "under_review",
    updatedBy: ctx.userId,
  });

  revalidatePath("/tools");
}
