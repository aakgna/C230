CREATE TYPE "public"."ai_tool_usage_event_source" AS ENUM('extension');--> statement-breakpoint
CREATE TABLE "ai_tool_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"matched_tool_id" uuid,
	"detected_at" timestamp with time zone NOT NULL,
	"source" "ai_tool_usage_event_source" DEFAULT 'extension' NOT NULL,
	"client_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_usage_events_client_event_id_unique" UNIQUE("client_event_id")
);
--> statement-breakpoint
ALTER TABLE "ai_tool_usage_events" ADD CONSTRAINT "ai_tool_usage_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_usage_events" ADD CONSTRAINT "ai_tool_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_usage_events" ADD CONSTRAINT "ai_tool_usage_events_matched_tool_id_ai_tool_register_id_fk" FOREIGN KEY ("matched_tool_id") REFERENCES "public"."ai_tool_register"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tool_usage_events_firm_detected_idx" ON "ai_tool_usage_events" USING btree ("firm_id","detected_at");--> statement-breakpoint
CREATE INDEX "ai_tool_usage_events_firm_user_detected_idx" ON "ai_tool_usage_events" USING btree ("firm_id","user_id","detected_at");