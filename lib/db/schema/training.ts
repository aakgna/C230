import { pgTable, uuid, text, timestamp, pgEnum, integer, boolean, unique } from "drizzle-orm/pg-core";
import { firms, users } from "./firms";

export const trainingContentTypeEnum = pgEnum("training_content_type", ["video", "interactive", "doc"]);

// Global catalog, not firm-scoped.
export const trainingModules = pgTable("training_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  contentType: trainingContentTypeEnum("content_type").notNull(),
  contentBody: text("content_body").notNull(), // placeholder markdown or stub video URL
  durationMinutes: integer("duration_minutes"),
  isActive: boolean("is_active").notNull().default(true),
});

export const trainingCompletions = pgTable(
  "training_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => trainingModules.id),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("training_completions_user_module_unique").on(table.userId, table.moduleId)]
);
