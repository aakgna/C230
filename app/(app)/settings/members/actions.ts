"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getPoolDb } from "@/lib/db/pool";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { requireFirmAdmin, requireCanSetRole, requireOwner } from "@/lib/auth/rbac";
import { updateMemberSchema, transferOwnershipSchema } from "@/lib/validation/schemas";

export async function updateMember(formData: FormData) {
  const ctx = await requireFirmContext();
  requireFirmAdmin(ctx, "manage firm members");

  const parsed = updateMemberSchema.parse({
    userId: formData.get("userId"),
    appRole: formData.get("appRole"),
    reviewLevel: formData.get("reviewLevel"),
  });

  const db = getDb();

  const [firm] = await db.select().from(schema.firms).where(eq(schema.firms.id, ctx.firmId)).limit(1);
  if (!firm) {
    throw new Error("Firm not found");
  }

  const [target] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, parsed.userId), eq(schema.users.firmId, ctx.firmId)))
    .limit(1);
  if (!target) {
    throw new Error("Member not found for this firm");
  }

  const isTargetOwner = target.id === firm.ownerId;

  // Only re-check the promotion/demotion hierarchy if the role is actually changing — changing
  // just the review level doesn't need it (any admin/owner can do that, per requireFirmAdmin
  // above already gating this whole action).
  if (parsed.appRole !== target.appRole) {
    requireCanSetRole(ctx, { appRole: target.appRole, isTargetOwner }, parsed.appRole, "change member role");
  }

  await db
    .update(schema.users)
    .set({ appRole: parsed.appRole, reviewLevel: parsed.reviewLevel })
    .where(and(eq(schema.users.id, parsed.userId), eq(schema.users.firmId, ctx.firmId)));

  revalidatePath("/settings/members");
  redirect("/settings/members");
}

/**
 * Only the current owner can initiate this — never an admin, even though admins can do most
 * other member management, since handing over the one "can demote another admin" power is a
 * fundamentally different kind of action than a routine role edit. Atomic: firm.ownerId moves,
 * the new owner is promoted to firm_admin (the owner-is-always-firm_admin invariant), and the
 * outgoing owner is explicitly set to firm_admin too — they're demoted from owner, not from
 * admin. Uses the pool driver for a real transaction, same reasoning as the hash chain: multiple
 * related writes that shouldn't be left half-applied.
 */
export async function transferOwnership(formData: FormData) {
  const ctx = await requireFirmContext();
  requireOwner(ctx, "transfer firm ownership");

  const parsed = transferOwnershipSchema.parse({
    newOwnerId: formData.get("newOwnerId"),
  });

  const pool = getPoolDb();

  await pool.transaction(async (tx) => {
    const [firm] = await tx.select().from(schema.firms).where(eq(schema.firms.id, ctx.firmId)).limit(1).for("update");
    if (!firm) {
      throw new Error("Firm not found");
    }
    if (firm.ownerId !== ctx.userId) {
      // Stale read or a race with another transfer — re-check inside the lock, not just via ctx.
      throw new Error("You're no longer the owner");
    }

    const [newOwner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, parsed.newOwnerId), eq(schema.users.firmId, ctx.firmId)))
      .limit(1);
    if (!newOwner) {
      throw new Error("New owner must be an existing member of this firm");
    }
    if (newOwner.id === firm.ownerId) {
      throw new Error("This person is already the owner");
    }

    await tx.update(schema.firms).set({ ownerId: newOwner.id }).where(eq(schema.firms.id, ctx.firmId));

    await tx
      .update(schema.users)
      .set({ appRole: "firm_admin" })
      .where(and(eq(schema.users.id, newOwner.id), eq(schema.users.firmId, ctx.firmId)));

    // The outgoing owner (ctx.userId) — demoted to admin, not stripped of admin entirely.
    await tx
      .update(schema.users)
      .set({ appRole: "firm_admin" })
      .where(and(eq(schema.users.id, ctx.userId), eq(schema.users.firmId, ctx.firmId)));
  });

  revalidatePath("/settings/members");
  redirect("/settings/members");
}
