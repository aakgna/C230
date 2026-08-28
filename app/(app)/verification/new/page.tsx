import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { findToolByDomain } from "@/lib/tools/match-domain";
import { EntryForm, toDatetimeLocal } from "../entry-form";
import { submitVerificationEntry } from "../actions";

// Deliberately says nothing about compliance, pass/fail, or "escalation" — those aren't concepts
// this app has a mechanism for. Just states the register's current status; the reviewer decides
// what that means for this specific entry, e.g. via the existing "assumptions noted" field.
const STATUS_BANNER: Partial<Record<string, { text: string }>> = {
  prohibited: { text: "is currently marked prohibited in your firm's AI tool register." },
  under_review: { text: "is currently marked under review in your firm's AI tool register." },
};

export default async function NewVerificationEntryPage(props: PageProps<"/verification/new">) {
  const ctx = await requireFirmContext();
  const searchParams = await props.searchParams;
  const db = getDb();

  const [users, tools] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
    db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId)),
  ]);

  const now = toDatetimeLocal(new Date());

  // Populated when the browser extension deep-links here after detecting the user left a
  // watched AI site — lets the tool selection auto-fill instead of requiring a manual pick.
  const domainParam = typeof searchParams.domain === "string" ? searchParams.domain.toLowerCase() : undefined;
  const matchedTool = domainParam ? findToolByDomain(domainParam, tools) : undefined;
  // The extension also captures the exact chat URL (not just the domain) when it detects the
  // user left a watched tab — prefills "evidence location" so nobody has to copy-paste it.
  const evidenceUrlParam = typeof searchParams.evidenceUrl === "string" ? searchParams.evidenceUrl : undefined;
  // And the moment they left it — a closer proxy for "AI output generated at" than page-load
  // time, since the reviewer may not click the notification until several minutes later.
  const leftAtParam = typeof searchParams.leftAt === "string" ? new Date(searchParams.leftAt) : undefined;
  const aiOutputGeneratedAtDefault =
    leftAtParam && !Number.isNaN(leftAtParam.getTime()) ? toDatetimeLocal(leftAtParam) : now;

  const statusBanner = matchedTool ? STATUS_BANNER[matchedTool.status] : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Log a review</h1>
        <p className="text-sm text-muted-foreground">
          Once submitted, this entry needs approval from a different reviewer before it becomes part of the
          permanent record.
        </p>
      </div>

      {statusBanner && matchedTool && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/50 px-4 py-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {matchedTool.toolName} {statusBanner.text}
          </span>
          <Link href={`/tools/${matchedTool.id}`} className="ml-auto shrink-0 underline underline-offset-4">
            View register entry
          </Link>
        </div>
      )}

      <EntryForm
        action={submitVerificationEntry}
        users={users}
        tools={tools}
        defaultValues={{
          practitionerId: ctx.userId,
          aiToolId: matchedTool?.id,
          evidenceLocation: evidenceUrlParam,
          aiOutputGeneratedAt: aiOutputGeneratedAtDefault,
          reviewCompletedAt: now,
        }}
      />
    </div>
  );
}
