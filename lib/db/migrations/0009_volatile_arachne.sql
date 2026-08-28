CREATE TYPE "public"."review_step_action" AS ENUM('forwarded', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "verification_submission_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewer_level" integer NOT NULL,
	"action" "review_step_action" NOT NULL,
	"notes" text,
	"forwarded_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "review_level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Added nullable first, not NOT NULL: existing verification_submissions rows predate assignment
-- tracking and need a backfill value before the column can be required. See the UPDATE below.
ALTER TABLE "verification_submissions" ADD COLUMN "current_assignee_id" uuid;--> statement-breakpoint
-- Backfill: decided rows go to whoever decided them (or submitted_by if that's somehow unset);
-- still-pending rows (no decided_by yet) go to submitted_by as the best available placeholder —
-- there's no real historical "who was it assigned to" for submissions from before this feature.
UPDATE "verification_submissions" SET "current_assignee_id" = COALESCE("decided_by", "submitted_by") WHERE "current_assignee_id" IS NULL;--> statement-breakpoint
ALTER TABLE "verification_submissions" ALTER COLUMN "current_assignee_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_submission_reviews" ADD CONSTRAINT "verification_submission_reviews_submission_id_verification_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."verification_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submission_reviews" ADD CONSTRAINT "verification_submission_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submission_reviews" ADD CONSTRAINT "verification_submission_reviews_forwarded_to_id_users_id_fk" FOREIGN KEY ("forwarded_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_current_assignee_id_users_id_fk" FOREIGN KEY ("current_assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- NOT VALID: a handful of pre-existing pending rows from before this feature (single-user dev
-- firms with no one else to backfill an assignee from) can't satisfy this retroactively. New and
-- updated rows are still fully checked going forward — this only skips validating history.
ALTER TABLE "verification_submissions" ADD CONSTRAINT "submission_assignee_independent_while_pending" CHECK ("verification_submissions"."status" <> 'pending' OR ("verification_submissions"."current_assignee_id" <> "verification_submissions"."submitted_by" AND "verification_submissions"."current_assignee_id" <> "verification_submissions"."practitioner_id")) NOT VALID;
