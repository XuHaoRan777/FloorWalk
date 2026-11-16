CREATE TABLE "floorwalk"."ai_review_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_item_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_review_jobs_item_upload_unique" UNIQUE("inspection_item_id","uploaded_at"),
	CONSTRAINT "ai_review_jobs_status_check" CHECK ("floorwalk"."ai_review_jobs"."status" IN ('pending', 'processing', 'completed', 'manual', 'cancelled')),
	CONSTRAINT "ai_review_jobs_attempt_count_check" CHECK ("floorwalk"."ai_review_jobs"."attempt_count" BETWEEN 0 AND 4)
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "first_uploaded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "ai_reason" text;--> statement-breakpoint
ALTER TABLE "floorwalk"."ai_review_jobs" ADD CONSTRAINT "ai_review_jobs_inspection_item_id_inspection_items_id_fk" FOREIGN KEY ("inspection_item_id") REFERENCES "floorwalk"."inspection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_review_jobs_pending_available_idx" ON "floorwalk"."ai_review_jobs" USING btree ("available_at","id") WHERE "floorwalk"."ai_review_jobs"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_first_uploaded_by_id_users_id_fk" FOREIGN KEY ("first_uploaded_by_id") REFERENCES "floorwalk"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_ai_reason_length_check" CHECK ("floorwalk"."inspection_items"."ai_reason" IS NULL OR char_length(btrim("floorwalk"."inspection_items"."ai_reason")) BETWEEN 1 AND 500);