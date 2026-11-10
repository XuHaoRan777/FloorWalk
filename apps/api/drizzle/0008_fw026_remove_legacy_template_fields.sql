DROP INDEX "floorwalk"."templates_single_current_idx";--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ALTER COLUMN "ai_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" DROP COLUMN "photo_required";--> statement-breakpoint
ALTER TABLE "floorwalk"."template_items" DROP COLUMN "photo_required";--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" DROP COLUMN "is_current";--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD CONSTRAINT "templates_ai_standard_required_check" CHECK ("floorwalk"."templates"."ai_enabled" = false OR "floorwalk"."templates"."ai_standard_id" IS NOT NULL);