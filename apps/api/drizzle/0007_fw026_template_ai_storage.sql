CREATE TABLE "floorwalk"."ai_review_standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_review_standards_org_name_unique" UNIQUE("org_id","name"),
	CONSTRAINT "ai_review_standards_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "ai_review_standards_name_nonempty_check" CHECK (char_length(btrim("floorwalk"."ai_review_standards"."name")) > 0),
	CONSTRAINT "ai_review_standards_prompt_length_check" CHECK (char_length("floorwalk"."ai_review_standards"."prompt") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "min_photo_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "acceptance_criteria" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."template_items" ADD COLUMN "min_photo_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."template_items" ADD COLUMN "acceptance_criteria" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD COLUMN "ai_standard_id" uuid;--> statement-breakpoint
UPDATE "floorwalk"."template_items"
SET "min_photo_count" = CASE WHEN "photo_required" THEN 1 ELSE 0 END;--> statement-breakpoint
UPDATE "floorwalk"."inspection_items"
SET "min_photo_count" = CASE WHEN "photo_required" THEN 1 ELSE 0 END;--> statement-breakpoint
ALTER TABLE "floorwalk"."ai_review_standards" ADD CONSTRAINT "ai_review_standards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "floorwalk"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD CONSTRAINT "templates_org_ai_standard_fk" FOREIGN KEY ("org_id","ai_standard_id") REFERENCES "floorwalk"."ai_review_standards"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_min_photo_count_check" CHECK ("floorwalk"."inspection_items"."min_photo_count" BETWEEN 0 AND 10);--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_acceptance_criteria_length_check" CHECK (char_length("floorwalk"."inspection_items"."acceptance_criteria") <= 500);--> statement-breakpoint
ALTER TABLE "floorwalk"."template_items" ADD CONSTRAINT "template_items_min_photo_count_check" CHECK ("floorwalk"."template_items"."min_photo_count" BETWEEN 0 AND 10);--> statement-breakpoint
ALTER TABLE "floorwalk"."template_items" ADD CONSTRAINT "template_items_acceptance_criteria_length_check" CHECK (char_length("floorwalk"."template_items"."acceptance_criteria") <= 500);
