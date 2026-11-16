ALTER TABLE "floorwalk"."ai_review_jobs" DROP CONSTRAINT "ai_review_jobs_item_upload_unique";--> statement-breakpoint
ALTER TABLE "floorwalk"."ai_review_jobs" ADD COLUMN "upload_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "upload_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."ai_review_jobs" ADD CONSTRAINT "ai_review_jobs_item_version_unique" UNIQUE("inspection_item_id","upload_version");--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_upload_version_check" CHECK ("floorwalk"."inspection_items"."upload_version" >= 0);