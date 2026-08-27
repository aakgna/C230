CREATE TYPE "public"."verification_submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "verification_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"ai_tool_id" uuid NOT NULL,
	"task_category" "task_category" NOT NULL,
	"client_reference" text,
	"checklist_items_reviewed" jsonb NOT NULL,
	"assumptions_noted" text,
	"evidence_location" text,
	"outcome" "verification_outcome" NOT NULL,
	"flag_reason" text,
	"ai_output_generated_at" timestamp with time zone NOT NULL,
	"review_completed_at" timestamp with time zone NOT NULL,
	"delivered_to_client_at" timestamp with time zone,
	"reviewer_role" "reviewer_role" NOT NULL,
	"amends_entry_id" uuid,
	"status" "verification_submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"verification_log_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_submissions_log_unique" UNIQUE("verification_log_id"),
	CONSTRAINT "submission_flag_reason_required_when_flagged" CHECK ("verification_submissions"."outcome" <> 'flagged' OR "verification_submissions"."flag_reason" IS NOT NULL),
	CONSTRAINT "submission_review_after_generation" CHECK ("verification_submissions"."review_completed_at" >= "verification_submissions"."ai_output_generated_at"),
	CONSTRAINT "submission_delivery_after_review" CHECK ("verification_submissions"."delivered_to_client_at" IS NULL OR "verification_submissions"."delivered_to_client_at" >= "verification_submissions"."review_completed_at"),
	CONSTRAINT "submission_decision_notes_required_when_rejected" CHECK ("verification_submissions"."status" <> 'rejected' OR "verification_submissions"."decision_notes" IS NOT NULL),
	CONSTRAINT "submission_decided_fields_consistent" CHECK ("verification_submissions"."status" = 'pending' OR ("verification_submissions"."decided_by" IS NOT NULL AND "verification_submissions"."decided_at" IS NOT NULL)),
	CONSTRAINT "submission_log_id_set_iff_approved" CHECK (("verification_submissions"."status" = 'approved') = ("verification_submissions"."verification_log_id" IS NOT NULL)),
	CONSTRAINT "submission_decider_independent" CHECK ("verification_submissions"."decided_by" IS NULL OR ("verification_submissions"."decided_by" <> "verification_submissions"."submitted_by" AND "verification_submissions"."decided_by" <> "verification_submissions"."practitioner_id"))
);
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "pending_owner_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_log_reviewer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_log" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "verification_log" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_log" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_practitioner_id_users_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_ai_tool_id_ai_tool_register_id_fk" FOREIGN KEY ("ai_tool_id") REFERENCES "public"."ai_tool_register"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_amends_entry_id_verification_log_id_fk" FOREIGN KEY ("amends_entry_id") REFERENCES "public"."verification_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_verification_log_id_verification_log_id_fk" FOREIGN KEY ("verification_log_id") REFERENCES "public"."verification_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firms" ADD CONSTRAINT "firms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_submission_id_verification_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."verification_submissions"("id") ON DELETE no action ON UPDATE no action;