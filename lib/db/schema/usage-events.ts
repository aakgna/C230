import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { firms, users } from "./firms";
import { aiToolRegister } from "./tools";

export const aiToolUsageEventSourceEnum = pgEnum("ai_tool_usage_event_source", ["extension"]);

// Lightweight signal, deliberately not evidence: domain + who + when, nothing else. No page
// content, no prompts, no anything typed — that's a hard privacy line, not an oversight. Written
// independently of whether a verification-log entry ever follows, so it can power "usage with no
// matching log entry" and "usage on an unregistered domain" (shadow usage) flags that nothing
// else in this schema can answer. The browser extension can't POST here directly — Clerk's
// session cookie is SameSite=Lax, which is cross-site (and so excluded) from an extension
// background-script fetch regardless of host_permissions — so events are queued client-side and
// flushed via a content script running on the app's own origin, which has a normal first-party
// session like any other page load. See extension/src/storage.js's outbox functions.
export const aiToolUsageEvents = pgTable(
  "ai_tool_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    domain: text("domain").notNull(),
    // Computed server-side at ingestion (not read time) by matching `domain` against this firm's
    // aiToolRegister.domains — null means shadow usage: nobody registered this domain at all.
    matchedToolId: uuid("matched_tool_id").references(() => aiToolRegister.id),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    source: aiToolUsageEventSourceEnum("source").notNull().default("extension"),
    // Generated client-side (extension), not server-side — lets a retried flush after a dropped
    // connection be a no-op instead of a duplicate row.
    clientEventId: uuid("client_event_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_tool_usage_events_firm_detected_idx").on(table.firmId, table.detectedAt),
    index("ai_tool_usage_events_firm_user_detected_idx").on(table.firmId, table.userId, table.detectedAt),
  ]
);
