import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { FirmContext } from "@/lib/auth/firm-context";

// How far back a usage event still counts as "recent" for the usage-based flags below. This is an
// unvalidated guess, not a measured threshold — there's no pilot-firm data yet on how long staff
// typically wait between using a tool and logging it. Revisit against real timing data before
// trusting this number; until then, treat "no matching log entry within 48h" flags as a rough
// signal, not a hard SLA. Fixed constant rather than a per-firm setting for now — nothing in
// this pass calls for making it configurable, but this is the knob to expose if it comes up.
const USAGE_WINDOW_HOURS = 48;

// A group (one practitioner, or one task category) needs at least this many verification-log
// entries before its rubber-stamp rate is treated as a pattern rather than noise — a single
// fast review otherwise reads as "100% rubber-stamp risk", which isn't a meaningful signal.
const MIN_RUBBER_STAMP_SAMPLE = 3;
const RUBBER_STAMP_RATE_THRESHOLD = 0.5;
const RUBBER_STAMP_LATENCY_MS = 60_000;

// New hires get this many days before an incomplete-training gap counts as "elevated" rather
// than "standard" — otherwise day-one staff would immediately show as a severe outlier.
const TRAINING_GRACE_DAYS = 14;
const TRAINING_ELEVATED_MISSING_SHARE = 0.5;

// Every count/date here is a fact, not a judgment — this deliberately never renders as a score,
// a "compliant"/"non-compliant" verdict, or pass/fail. `severity` is the one exception worth
// explaining: it's an urgency-of-follow-up signal (has this had enough data or time to be a real
// pattern, not just noise), not a compliance rating — e.g. a rubber-stamp rate computed from a
// single entry is deliberately "standard", not "elevated", no matter how alarming the raw
// percentage looks, because one entry can't establish a pattern.
export type AttentionFlag = {
  id: string;
  module: "policy" | "tools" | "training" | "verification";
  summary: string;
  detail: string;
  href: string;
  severity: "elevated" | "standard";
};

const MAX_NAMES_LISTED = 5;

function listNames(names: string[]): string {
  if (names.length <= MAX_NAMES_LISTED) return names.join(", ");
  return `${names.slice(0, MAX_NAMES_LISTED).join(", ")}, and ${names.length - MAX_NAMES_LISTED} more`;
}

function displayName(user: { fullName: string | null; email: string }): string {
  return user.fullName ?? user.email;
}

export async function getAttentionFlags(ctx: FirmContext): Promise<AttentionFlag[]> {
  const db = getDb();
  const flags: AttentionFlag[] = [];

  const activeUsers = await db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
      email: schema.users.email,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(and(eq(schema.users.firmId, ctx.firmId), eq(schema.users.isActive, true)));

  // --- Policy acknowledgment ---------------------------------------------------------------

  const [publishedPolicy] = await db
    .select({ id: schema.policyDocuments.id, version: schema.policyDocuments.version })
    .from(schema.policyDocuments)
    .where(and(eq(schema.policyDocuments.firmId, ctx.firmId), eq(schema.policyDocuments.status, "published")))
    .limit(1);

  if (publishedPolicy) {
    const unacknowledged = await db
      .select({ fullName: schema.users.fullName, email: schema.users.email })
      .from(schema.users)
      .leftJoin(
        schema.policyAcknowledgments,
        and(
          eq(schema.policyAcknowledgments.userId, schema.users.id),
          eq(schema.policyAcknowledgments.policyDocumentId, publishedPolicy.id)
        )
      )
      .where(and(eq(schema.users.firmId, ctx.firmId), eq(schema.users.isActive, true), isNull(schema.policyAcknowledgments.id)));

    if (unacknowledged.length > 0) {
      flags.push({
        id: `policy-ack-${publishedPolicy.id}`,
        module: "policy",
        summary: `${unacknowledged.length} staff member${unacknowledged.length === 1 ? "" : "s"} with no acknowledgment of the current AI-use policy (v${publishedPolicy.version})`,
        detail: listNames(unacknowledged.map(displayName)),
        href: `/policies/${publishedPolicy.id}`,
        severity: activeUsers.length > 0 && unacknowledged.length > activeUsers.length / 2 ? "elevated" : "standard",
      });
    }
  }

  // --- AI-tool usage events (recorded independently of the reminder/log flow) --------------

  const windowStart = new Date(Date.now() - USAGE_WINDOW_HOURS * 60 * 60 * 1000);
  const recentUsage = await db
    .select({
      userId: schema.aiToolUsageEvents.userId,
      matchedToolId: schema.aiToolUsageEvents.matchedToolId,
      domain: schema.aiToolUsageEvents.domain,
    })
    .from(schema.aiToolUsageEvents)
    .where(and(eq(schema.aiToolUsageEvents.firmId, ctx.firmId), gte(schema.aiToolUsageEvents.detectedAt, windowStart)));

  if (recentUsage.length > 0) {
    // Shadow usage (matchedToolId null — the domain isn't in the register at all) is its own
    // flag below; this one only covers usage of a *registered* tool that never got a
    // corresponding log entry or pending submission from the same practitioner.
    const matchedUsage = recentUsage.filter((event) => event.matchedToolId !== null);

    if (matchedUsage.length > 0) {
      const [recentLogEntries, recentSubmissions] = await Promise.all([
        db
          .select({ practitionerId: schema.verificationLog.practitionerId, aiToolId: schema.verificationLog.aiToolId })
          .from(schema.verificationLog)
          .where(and(eq(schema.verificationLog.firmId, ctx.firmId), gte(schema.verificationLog.createdAt, windowStart))),
        db
          .select({
            practitionerId: schema.verificationSubmissions.practitionerId,
            aiToolId: schema.verificationSubmissions.aiToolId,
          })
          .from(schema.verificationSubmissions)
          .where(
            and(
              eq(schema.verificationSubmissions.firmId, ctx.firmId),
              gte(schema.verificationSubmissions.submittedAt, windowStart)
            )
          ),
      ]);

      const loggedKeys = new Set([
        ...recentLogEntries.map((e) => `${e.practitionerId}:${e.aiToolId}`),
        ...recentSubmissions.map((e) => `${e.practitionerId}:${e.aiToolId}`),
      ]);

      const unloggedUsage = matchedUsage.filter((event) => !loggedKeys.has(`${event.userId}:${event.matchedToolId}`));

      if (unloggedUsage.length > 0) {
        const userIds = [...new Set(unloggedUsage.map((event) => event.userId))];
        const staff = await db
          .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, userIds));

        flags.push({
          id: "usage-no-log",
          module: "verification",
          summary: `${unloggedUsage.length} AI-tool use${unloggedUsage.length === 1 ? "" : "s"} in the last ${USAGE_WINDOW_HOURS}h with no matching verification log entry or pending submission`,
          detail: listNames(staff.map(displayName)),
          href: "/verification",
          severity: "elevated", // already past the grace window by construction
        });
      }
    }

    const shadowUsage = recentUsage.filter((event) => event.matchedToolId === null);
    if (shadowUsage.length > 0) {
      const domains = [...new Set(shadowUsage.map((event) => event.domain))];
      flags.push({
        id: "usage-shadow-domain",
        module: "tools",
        summary: `${shadowUsage.length} AI-tool use${shadowUsage.length === 1 ? "" : "s"} in the last ${USAGE_WINDOW_HOURS}h on a domain not in your firm's AI tool register`,
        detail: listNames(domains),
        href: "/tools",
        severity: "elevated", // unregistered/ungoverned tool use
      });
    }
  }

  // --- Training completion, by staff member -------------------------------------------------

  const [completions, activeModules] = await Promise.all([
    db
      .select({ userId: schema.trainingCompletions.userId, moduleId: schema.trainingCompletions.moduleId })
      .from(schema.trainingCompletions)
      .where(eq(schema.trainingCompletions.firmId, ctx.firmId)),
    db.select({ id: schema.trainingModules.id }).from(schema.trainingModules).where(eq(schema.trainingModules.isActive, true)),
  ]);

  if (activeModules.length > 0 && activeUsers.length > 0) {
    const completedByUser = new Map<string, Set<string>>();
    for (const c of completions) {
      const set = completedByUser.get(c.userId) ?? new Set<string>();
      set.add(c.moduleId);
      completedByUser.set(c.userId, set);
    }

    const now = Date.now();
    // "Days since joined" is a proxy, not a real training-assignment deadline — trainingModules
    // has no due-date/assignment-date concept in the current schema, only isActive. This is the
    // best available signal; a real per-assignment due date would need a schema change.
    const gaps = activeUsers
      .map((user) => {
        const missingCount = activeModules.length - (completedByUser.get(user.id)?.size ?? 0);
        const daysSinceJoined = Math.floor((now - user.createdAt.getTime()) / (24 * 60 * 60 * 1000));
        return { user, missingCount, daysSinceJoined };
      })
      .filter((g) => g.missingCount > 0)
      .sort((a, b) => b.missingCount - a.missingCount || b.daysSinceJoined - a.daysSinceJoined);

    if (gaps.length > 0) {
      const totalMissing = gaps.reduce((sum, g) => sum + g.missingCount, 0);
      const isElevated = gaps.some(
        (g) => g.daysSinceJoined > TRAINING_GRACE_DAYS && g.missingCount / activeModules.length >= TRAINING_ELEVATED_MISSING_SHARE
      );

      flags.push({
        id: "training-gap",
        module: "training",
        summary: `${gaps.length} staff member${gaps.length === 1 ? "" : "s"} with incomplete training (${totalMissing} of ${activeUsers.length * activeModules.length} staff × module assignments outstanding)`,
        detail: listNames(
          gaps.map((g) => `${displayName(g.user)} (${g.missingCount} of ${activeModules.length} modules, joined ${g.daysSinceJoined}d ago)`)
        ),
        href: "/training",
        severity: isElevated ? "elevated" : "standard",
      });
    }
  }

  // --- Review latency ("rubber-stamp") pattern, by practitioner and by task category --------

  const logEntries = await db
    .select({
      practitionerId: schema.verificationLog.practitionerId,
      taskCategory: schema.verificationLog.taskCategory,
      aiOutputGeneratedAt: schema.verificationLog.aiOutputGeneratedAt,
      reviewCompletedAt: schema.verificationLog.reviewCompletedAt,
    })
    .from(schema.verificationLog)
    .where(eq(schema.verificationLog.firmId, ctx.firmId));

  if (logEntries.length > 0) {
    const withLatency = logEntries.map((e) => ({
      ...e,
      isRubberStamp: e.reviewCompletedAt.getTime() - e.aiOutputGeneratedAt.getTime() < RUBBER_STAMP_LATENCY_MS,
    }));

    function groupRate(keyFn: (e: (typeof withLatency)[number]) => string) {
      const groups = new Map<string, { total: number; rubberStamp: number }>();
      for (const e of withLatency) {
        const key = keyFn(e);
        const g = groups.get(key) ?? { total: 0, rubberStamp: 0 };
        g.total += 1;
        if (e.isRubberStamp) g.rubberStamp += 1;
        groups.set(key, g);
      }
      return [...groups.entries()]
        .map(([key, g]) => ({ key, ...g, rate: g.rubberStamp / g.total }))
        .filter((g) => g.total >= MIN_RUBBER_STAMP_SAMPLE && g.rate >= RUBBER_STAMP_RATE_THRESHOLD)
        .sort((a, b) => b.rate - a.rate);
    }

    const byPractitioner = groupRate((e) => e.practitionerId);
    const byCategory = groupRate((e) => e.taskCategory);

    if (byPractitioner.length > 0) {
      const staff = await db
        .select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, byPractitioner.map((g) => g.key)));
      const staffById = new Map(staff.map((u) => [u.id, u]));

      flags.push({
        id: "rubber-stamp-practitioner",
        module: "verification",
        summary: `${byPractitioner.length} staff member${byPractitioner.length === 1 ? "" : "s"} with ${Math.round(RUBBER_STAMP_RATE_THRESHOLD * 100)}%+ of reviews completed in under 60 seconds (${MIN_RUBBER_STAMP_SAMPLE}+ entries each)`,
        detail: listNames(
          byPractitioner.map((g) => {
            const u = staffById.get(g.key);
            return `${u ? displayName(u) : "Unknown"} (${g.rubberStamp} of ${g.total})`;
          })
        ),
        href: "/verification",
        severity: "elevated",
      });
    }

    if (byCategory.length > 0) {
      flags.push({
        id: "rubber-stamp-category",
        module: "verification",
        summary: `${byCategory.length} task categor${byCategory.length === 1 ? "y" : "ies"} with ${Math.round(RUBBER_STAMP_RATE_THRESHOLD * 100)}%+ of reviews completed in under 60 seconds (${MIN_RUBBER_STAMP_SAMPLE}+ entries each)`,
        detail: listNames(byCategory.map((g) => `${g.key.replace(/_/g, " ")} (${g.rubberStamp} of ${g.total})`)),
        href: "/verification",
        severity: "elevated",
      });
    }

    // Neither breakdown had enough entries in any single group to say anything — but if the
    // firm-wide rate is still notable, that's worth surfacing as an exception too, just
    // honestly labeled as too small a sample to localize yet, rather than silently dropped.
    if (byPractitioner.length === 0 && byCategory.length === 0) {
      const totalRubberStamp = withLatency.filter((e) => e.isRubberStamp).length;
      const overallRate = totalRubberStamp / withLatency.length;
      if (overallRate >= RUBBER_STAMP_RATE_THRESHOLD) {
        flags.push({
          id: "rubber-stamp-overall",
          module: "verification",
          summary: `${totalRubberStamp} of ${withLatency.length} verification entr${withLatency.length === 1 ? "y" : "ies"} firm-wide reviewed in under 60 seconds`,
          detail: `Fewer than ${MIN_RUBBER_STAMP_SAMPLE} entries for any one staff member or task category yet — not enough to localize this to a person or category.`,
          href: "/verification",
          severity: "standard",
        });
      }
    }
  }

  // --- AI tool register entries with no documented vetting rationale ------------------------

  const tools = await db
    .select({
      id: schema.aiToolRegister.id,
      toolName: schema.aiToolRegister.toolName,
      status: schema.aiToolRegister.status,
      vettingNotes: schema.aiToolRegister.vettingNotes,
    })
    .from(schema.aiToolRegister)
    .where(eq(schema.aiToolRegister.firmId, ctx.firmId));

  const undocumented = tools.filter((t) => !t.vettingNotes || t.vettingNotes.trim() === "");
  if (undocumented.length > 0) {
    flags.push({
      id: "tools-no-vetting-note",
      module: "tools",
      summary: `${undocumented.length} tool${undocumented.length === 1 ? "" : "s"} in the register with no vetting note`,
      detail: listNames(undocumented.map((t) => `${t.toolName} (${t.status.replace(/_/g, " ")})`)),
      href: "/tools",
      severity: undocumented.some((t) => t.status !== "approved") ? "elevated" : "standard",
    });
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "elevated" ? -1 : 1));
}
