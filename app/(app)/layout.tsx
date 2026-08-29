import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { AlertTriangleIcon } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/policies", label: "Policies" },
  { href: "/training", label: "Training" },
  { href: "/tools", label: "AI Tools" },
  { href: "/verification", label: "Verification Log" },
  { href: "/settings/members", label: "Members" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Resolves the Clerk session to a firm-scoped context. If the user has no
  // active organization, this redirects to /settings/organization.
  const ctx = await requireFirmContext();

  const db = getDb();
  // Published policy with no acknowledgment row for this user — left join + isNull rather than
  // a NOT IN subquery, same technique as the rest of this app's "who hasn't done X" queries.
  const [pendingAck] = await db
    .select({ id: schema.policyDocuments.id, version: schema.policyDocuments.version })
    .from(schema.policyDocuments)
    .leftJoin(
      schema.policyAcknowledgments,
      and(
        eq(schema.policyAcknowledgments.policyDocumentId, schema.policyDocuments.id),
        eq(schema.policyAcknowledgments.userId, ctx.userId)
      )
    )
    .where(
      and(
        eq(schema.policyDocuments.firmId, ctx.firmId),
        eq(schema.policyDocuments.status, "published"),
        isNull(schema.policyAcknowledgments.id)
      )
    )
    .limit(1);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-6 items-center justify-center rounded-[4px] border border-info/40 font-mono text-[9px] font-medium text-info">
              §230
            </span>
            Circular 230 Kit
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <OrganizationSwitcher hidePersonal />
          <UserButton />
        </div>
      </header>
      {pendingAck && (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-6 py-2 text-sm">
          <AlertTriangleIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Your firm published an updated AI-use policy (v{pendingAck.version}) — please review it.
          </span>
          <Link href={`/policies/${pendingAck.id}`} className="ml-auto underline underline-offset-4">
            Review &amp; acknowledge
          </Link>
        </div>
      )}
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
