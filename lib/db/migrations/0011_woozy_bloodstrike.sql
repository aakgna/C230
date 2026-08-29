ALTER TABLE "users" DROP CONSTRAINT "users_clerk_user_id_unique";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_firm_clerk_user_unique" UNIQUE("firm_id","clerk_user_id");