CREATE SCHEMA "floorwalk";
--> statement-breakpoint
CREATE TABLE "floorwalk"."sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"site_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("role" IN ('inspector', 'supervisor', 'hq')),
	CONSTRAINT "users_role_site_check" CHECK (("role" = 'inspector' AND "site_id" IS NOT NULL) OR ("role" <> 'inspector' AND "site_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"photo_required" boolean DEFAULT false NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_items_template_position_unique" UNIQUE("template_id", "position"),
	CONSTRAINT "template_items_position_positive" CHECK ("position" > 0)
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"inspector_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"score" integer,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspections_score_range" CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100),
	CONSTRAINT "inspections_status_check" CHECK ("status" IN ('draft', 'submitted', 'in_review', 'passed', 'rework', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."inspection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"photo_required" boolean NOT NULL,
	"critical" boolean NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_items_inspection_position_unique" UNIQUE("inspection_id", "position"),
	CONSTRAINT "inspection_items_position_positive" CHECK ("position" > 0),
	CONSTRAINT "inspection_items_result_check" CHECK ("result" IN ('pending', 'pass', 'fail'))
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_item_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_size_nonnegative" CHECK ("size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"action" text NOT NULL,
	"comment" text,
	"rework_item_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_action_check" CHECK ("action" IN ('start', 'approve', 'rework', 'fail')),
	CONSTRAINT "reviews_rework_items_check" CHECK (("action" = 'rework' AND "rework_item_ids" IS NOT NULL AND cardinality("rework_item_ids") > 0) OR ("action" <> 'rework' AND "rework_item_ids" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "floorwalk"."sites"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."template_items" ADD CONSTRAINT "template_items_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "floorwalk"."templates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspections" ADD CONSTRAINT "inspections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "floorwalk"."sites"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspections" ADD CONSTRAINT "inspections_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "floorwalk"."templates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "floorwalk"."inspections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."evidence" ADD CONSTRAINT "evidence_inspection_item_id_inspection_items_id_fk" FOREIGN KEY ("inspection_item_id") REFERENCES "floorwalk"."inspection_items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."reviews" ADD CONSTRAINT "reviews_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "floorwalk"."inspections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floorwalk"."reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "inspections_site_status_idx" ON "floorwalk"."inspections" ("site_id", "status");
--> statement-breakpoint
CREATE INDEX "inspections_created_at_idx" ON "floorwalk"."inspections" ("created_at");
--> statement-breakpoint
CREATE INDEX "evidence_item_idx" ON "floorwalk"."evidence" ("inspection_item_id");
