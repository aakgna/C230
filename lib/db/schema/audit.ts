import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { firms, users } from "./firms";

export const auditReportExports = pgTable("audit_report_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  rangeStart: timestamp("range_start", { withTimezone: true }),
  rangeEnd: timestamp("range_end", { withTimezone: true }),
  chainValid: boolean("chain_valid").notNull(),
  signature: text("signature").notNull(), // hex HMAC-SHA256 over the report content
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => users.id),
});
