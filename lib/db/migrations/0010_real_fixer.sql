-- Backfill: closest equivalent of the old flat isLogReviewer model under the new leveled one.
-- Firm admins can build out more levels afterward via Settings > Members.
UPDATE "users" SET "review_level" = 2 WHERE "is_log_reviewer" = true;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_log_reviewer";
