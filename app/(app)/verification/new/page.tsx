import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { findToolByDomain } from "@/lib/tools/match-domain";
import { OTHER_TOOL_VALUE } from "@/lib/validation/schemas";
import { getEligibleNextReviewers } from "@/lib/verification/review-chain";
import { toDatetimeLocal } from "@/lib/verification/format-datetime";
import { EntryForm } from "../entry-form";
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

  const [users, tools, eligibleReviewers] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
    db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId)),
    getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [ctx.userId]),
  ]);

  const now = toDatetimeLocal(new Date());

  // Populated when the browser extension deep-links here after detecting the user left a
  // watched AI site — lets the tool selection auto-fill instead of requiring a manual pick.
  const domainParam = typeof searchParams.domain === "string" ? searchParams.domain.toLowerCase() : undefined;
  const matchedTool = domainParam ? findToolByDomain(domainParam, tools) : undefined;
  // Falls back to matching the extension's friendly tool name (e.g. "Claude") against this
  // firm's registered tool names — catches the case where the tool is registered but nobody's
  // filled in its domains yet, without needing that data-entry step done first. If neither
  // matches, the form defaults to "Other (specify)" with this name pre-filled instead of leaving
  // the picker blank — see entry-form.tsx and entry-helpers.ts's verifyPractitionerAndTool.
  const toolNameParam = typeof searchParams.toolName === "string" ? searchParams.toolName : undefined;
  const nameMatchedTool =
    !matchedTool && toolNameParam
      ? tools.find((t) => t.toolName.trim().toLowerCase() === toolNameParam.trim().toLowerCase())
      : undefined;
  const resolvedTool = matchedTool ?? nameMatchedTool;
  // The extension also captures the exact chat URL (not just the domain) when it detects the
  // user left a watched tab — prefills "evidence location" so nobody has to copy-paste it.
  const evidenceUrlParam = typeof searchParams.evidenceUrl === "string" ? searchParams.evidenceUrl : undefined;
  // And the moment they left it — a closer proxy for "AI output generated at" than page-load
  // time, since the reviewer may not click the notification until several minutes later.
  const leftAtParam = typeof searchParams.leftAt === "string" ? new Date(searchParams.leftAt) : undefined;
  const aiOutputGeneratedAtDefault =
    leftAtParam && !Number.isNaN(leftAtParam.getTime()) ? toDatetimeLocal(leftAtParam) : now;

  const statusBanner = resolvedTool ? STATUS_BANNER[resolvedTool.status] : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Log a review</h1>
        <p className="text-sm text-muted-foreground">
          Once submitted, this entry needs approval from a different reviewer before it becomes part of the
          permanent record.
        </p>
      </div>

      {statusBanner && resolvedTool && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/50 px-4 py-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {resolvedTool.toolName} {statusBanner.text}
          </span>
          <Link href={`/tools/${resolvedTool.id}`} className="ml-auto shrink-0 underline underline-offset-4">
            View register entry
          </Link>
        </div>
      )}

      <EntryForm
        action={submitVerificationEntry}
        users={users}
        tools={tools}
        eligibleReviewers={eligibleReviewers}
        defaultValues={{
          practitionerId: ctx.userId,
          aiToolId: resolvedTool?.id ?? (toolNameParam ? OTHER_TOOL_VALUE : undefined),
          otherToolName: resolvedTool ? undefined : toolNameParam,
          detectedDomain: domainParam,
          evidenceLocation: evidenceUrlParam,
          aiOutputGeneratedAt: aiOutputGeneratedAtDefault,
          reviewCompletedAt: now,
        }}
      />
    </div>
  );
}
