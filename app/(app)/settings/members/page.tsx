import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLE_VARIANT: Record<string, "default" | "secondary"> = {
  firm_admin: "default",
  practitioner: "secondary",
};

export default async function MembersPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const [firm, members] = await Promise.all([
    db.select().from(schema.firms).where(eq(schema.firms.id, ctx.firmId)).limit(1).then((rows) => rows[0]),
    db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
  ]);

  const canManage = ctx.appRole === "firm_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">
          Roles and log-reviewer status for everyone at your firm. A reviewer must be someone other than the
          submitter to approve a verification-log entry.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Log reviewer</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="font-medium">{member.fullName ?? member.email}</div>
                <div className="text-xs text-muted-foreground">{member.email}</div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Badge variant={ROLE_VARIANT[member.appRole] ?? "secondary"}>{member.appRole.replace("_", " ")}</Badge>
                  {member.id === firm?.ownerId && <Badge variant="outline">Owner</Badge>}
                </div>
              </TableCell>
              <TableCell>
                {member.isLogReviewer ? <Badge>Log reviewer</Badge> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <Link href={`/settings/members/${member.id}`} className="text-sm underline underline-offset-4">
                    Edit
                  </Link>
                </TableCell>
              )}
            </TableRow>
          ))}
          {members.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground">
                No members yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
