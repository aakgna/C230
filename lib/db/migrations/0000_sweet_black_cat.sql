CREATE TYPE "public"."app_role" AS ENUM('firm_admin', 'practitioner');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('approved', 'under_review', 'prohibited');--> statement-breakpoint
CREATE TYPE "public"."reviewer_role" AS ENUM('preparer', 'reviewing_partner', 'ea', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_category" AS ENUM('return_prep', 'research_memo', 'client_correspondence', 'written_advice', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_outcome" AS ENUM('approved', 'flagged', 'escalated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."training_content_type" AS ENUM('video', 'interactive', 'doc');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('draft', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."eval_finding_category" AS ENUM('ungrounded_claim', 'citation_mismatch', 'missed_refusal', 'other');--> statement-breakpoint
CREATE TYPE "public"."eval_finding_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"chain_genesis_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firms_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"title" text,
	"app_role" "app_role" DEFAULT 'practitioner' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "ai_tool_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "ai_tool_register" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"catalog_id" uuid,
	"tool_name" text NOT NULL,
	"status" "tool_status" DEFAULT 'under_review' NOT NULL,
	"vetting_notes" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_chain_state" (
	"firm_id" uuid PRIMARY KEY NOT NULL,
	"last_sequence_no" integer DEFAULT 0 NOT NULL,
	"last_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"ai_tool_id" uuid NOT NULL,
	"task_category" "task_category" NOT NULL,
	"checklist_items_reviewed" jsonb NOT NULL,
	"outcome" "verification_outcome" NOT NULL,
	"flag_reason" text,
	"ai_output_generated_at" timestamp with time zone NOT NULL,
	"review_completed_at" timestamp with time zone NOT NULL,
	"delivered_to_client_at" timestamp with time zone,
	"reviewer_role" "reviewer_role" NOT NULL,
	"amends_entry_id" uuid,
	"sequence_no" integer NOT NULL,
	"prior_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_log_firm_sequence_unique" UNIQUE("firm_id","sequence_no"),
	CONSTRAINT "flag_reason_required_when_flagged" CHECK ("verification_log"."outcome" <> 'flagged' OR "verification_log"."flag_reason" IS NOT NULL),
	CONSTRAINT "review_after_generation" CHECK ("verification_log"."review_completed_at" >= "verification_log"."ai_output_generated_at"),
	CONSTRAINT "delivery_after_review" CHECK ("verification_log"."delivered_to_client_at" IS NULL OR "verification_log"."delivered_to_client_at" >= "verification_log"."review_completed_at")
);
--> statement-breakpoint
CREATE TABLE "training_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_completions_user_module_unique" UNIQUE("user_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "training_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content_type" "training_content_type" NOT NULL,
	"content_body" text NOT NULL,
	"duration_minutes" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_title" text NOT NULL,
	"section_ref" text NOT NULL,
	"version_label" text,
	"effective_date" date NOT NULL,
	"expiration_date" date,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_document_clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_document_id" uuid NOT NULL,
	"clause_order" integer NOT NULL,
	"circular230_section" text NOT NULL,
	"clause_text" text NOT NULL,
	"cited_chunk_id" uuid,
	"is_refusal" boolean DEFAULT false NOT NULL,
	"refusal_reason" text,
	"is_manually_edited" boolean DEFAULT false NOT NULL,
	"original_text" text
);
--> statement-breakpoint
CREATE TABLE "policy_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"policy_slug" text NOT NULL,
	"version" integer NOT NULL,
	"effective_date" date,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"intake_answers" jsonb NOT NULL,
	"created_by" uuid,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_documents_firm_slug_version_unique" UNIQUE("firm_id","policy_slug","version")
);
--> statement-breakpoint
CREATE TABLE "eval_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"clause_id" uuid,
	"category" "eval_finding_category" NOT NULL,
	"severity" "eval_finding_severity" NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_document_id" uuid NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judge_model" text NOT NULL,
	"passed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"range_start" timestamp with time zone,
	"range_end" timestamp with time zone,
	"chain_valid" boolean NOT NULL,
	"signature" text NOT NULL,
	"generated_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_register" ADD CONSTRAINT "ai_tool_register_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_register" ADD CONSTRAINT "ai_tool_register_catalog_id_ai_tool_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."ai_tool_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_register" ADD CONSTRAINT "ai_tool_register_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firm_chain_state" ADD CONSTRAINT "firm_chain_state_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_practitioner_id_users_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_ai_tool_id_ai_tool_register_id_fk" FOREIGN KEY ("ai_tool_id") REFERENCES "public"."ai_tool_register"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_completions" ADD CONSTRAINT "training_completions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_completions" ADD CONSTRAINT "training_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_completions" ADD CONSTRAINT "training_completions_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_chunks" ADD CONSTRAINT "corpus_chunks_document_id_corpus_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."corpus_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_document_clauses" ADD CONSTRAINT "policy_document_clauses_policy_document_id_policy_documents_id_fk" FOREIGN KEY ("policy_document_id") REFERENCES "public"."policy_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_document_clauses" ADD CONSTRAINT "policy_document_clauses_cited_chunk_id_corpus_chunks_id_fk" FOREIGN KEY ("cited_chunk_id") REFERENCES "public"."corpus_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_findings" ADD CONSTRAINT "eval_findings_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_findings" ADD CONSTRAINT "eval_findings_clause_id_policy_document_clauses_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."policy_document_clauses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_policy_document_id_policy_documents_id_fk" FOREIGN KEY ("policy_document_id") REFERENCES "public"."policy_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_report_exports" ADD CONSTRAINT "audit_report_exports_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_report_exports" ADD CONSTRAINT "audit_report_exports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corpus_chunks_embedding_hnsw" ON "corpus_chunks" USING hnsw ("embedding" vector_cosine_ops);