ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_org_id_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
CREATE TABLE "floorwalk"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_type_check" CHECK ("floorwalk"."notifications"."type" IN ('item_rework', 'inspection_decided', 'inspection_overridden', 'critical_item_failed', 'task_overdue', 'manual_review_needed', 'chat_message'))
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."notifications" ADD CONSTRAINT "notifications_org_user_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "floorwalk"."users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "floorwalk"."notifications" USING btree ("org_id","user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "floorwalk"."notifications" USING btree ("org_id","user_id","created_at","id") WHERE "floorwalk"."notifications"."read_at" IS NULL;
