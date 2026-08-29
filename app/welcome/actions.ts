"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { updateOwnProfileSchema } from "@/lib/validation/schemas";

export async function completeProfile(formData: FormData) {
  const ctx = await requireFirmContext();

  const parsed = updateOwnProfileSchema.parse({
    fullName: formData.get("fullName"),
  });

  const db = getDb();
  await db.update(schema.users).set({ fullName: parsed.fullName }).where(eq(schema.users.id, ctx.userId));

  redirect("/dashboard");
}
