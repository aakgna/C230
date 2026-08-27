import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { appRoleValues } from "@/lib/validation/schemas";
import { updateMember, transferOwnership } from "../actions";

export default async function EditMemberPage(props: PageProps<"/settings/members/[userId]">) {
  const { userId } = await props.params;
  const ctx = await requireFirmContext();

  if (ctx.appRole !== "firm_admin") {
    notFound();
  }

  const db = getDb();

  const [firm, target] = await Promise.all([
    db.select().from(schema.firms).where(eq(schema.firms.id, ctx.firmId)).limit(1).then((rows) => rows[0]),
    db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), eq(schema.users.firmId, ctx.firmId)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!target || !firm) {
    notFound();
  }

  const isTargetOwner = target.id === firm.ownerId;
  // Regular admins can't demote a fellow admin (or themselves) — only the firm's owner can.
  // Promoting a practitioner to admin has no such restriction.
  const roleLocked = isTargetOwner || (target.appRole === "firm_admin" && !ctx.isOwner);
  // Only true when the owner is viewing their own page — isTargetOwner and ctx.isOwner can only
  // both hold at once for the owner themselves, since ownership is unique per firm.
  const viewingOwnOwnerPage = ctx.isOwner && isTargetOwner;

  const otherMembers = viewingOwnOwnerPage
    ? await db
        .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
        .from(schema.users)
        .where(and(eq(schema.users.firmId, ctx.firmId), ne(schema.users.id, target.id)))
    : [];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">{target.fullName ?? target.email}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role &amp; permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateMember} className="space-y-4">
            <input type="hidden" name="userId" value={target.id} />

            <div className="space-y-1.5">
              <Label htmlFor="appRole">Role</Label>
              {roleLocked ? (
                <>
                  <input type="hidden" name="appRole" value={target.appRole} />
                  <p className="text-sm">
                    {isTargetOwner ? "Owner (firm_admin)" : target.appRole.replace("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isTargetOwner
                      ? viewingOwnOwnerPage
                        ? "Ownership has to be transferred, not edited as a role — see below."
                        : "Ownership can only be transferred by the current owner."
                      : "Only the firm's owner can change another admin's role."}
                  </p>
                </>
              ) : (
                <Select name="appRole" defaultValue={target.appRole}>
                  <SelectTrigger id="appRole" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {appRoleValues.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="isLogReviewer" name="isLogReviewer" defaultChecked={target.isLogReviewer} />
              <Label htmlFor="isLogReviewer" className="font-normal">
                Can review and approve verification-log submissions
              </Label>
            </div>

            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      {viewingOwnOwnerPage && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Transfer ownership</CardTitle>
          </CardHeader>
          <CardContent>
            {otherMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                There&apos;s no one else at this firm yet to transfer ownership to.
              </p>
            ) : (
              <form action={transferOwnership} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You&apos;ll immediately lose owner-level powers (like demoting another admin) and become a regular
                  admin. This can be undone later, but only by whoever becomes the new owner.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="newOwnerId">New owner</Label>
                  <Select
                    name="newOwnerId"
                    required
                    items={otherMembers.map((m) => ({ value: m.id, label: m.fullName ?? m.email }))}
                  >
                    <SelectTrigger id="newOwnerId" className="w-full">
                      <SelectValue placeholder="Select a member" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.fullName ?? m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" variant="destructive">
                  Transfer ownership
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
