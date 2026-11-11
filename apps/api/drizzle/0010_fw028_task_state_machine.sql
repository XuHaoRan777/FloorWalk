CREATE TABLE "floorwalk"."inspection_item_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_item_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"previous_result" text,
	"new_result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_item_decisions_previous_result_check" CHECK ("floorwalk"."inspection_item_decisions"."previous_result" IS NULL OR "floorwalk"."inspection_item_decisions"."previous_result" IN ('pass', 'rework', 'fail')),
	CONSTRAINT "inspection_item_decisions_new_result_check" CHECK ("floorwalk"."inspection_item_decisions"."new_result" IN ('pass', 'rework', 'fail'))
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."inspection_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"task_date" date NOT NULL,
	"position" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_tasks_org_site_date_position_unique" UNIQUE("org_id","site_id","task_date","position"),
	CONSTRAINT "inspection_tasks_position_check" CHECK ("floorwalk"."inspection_tasks"."position" >= 0),
	CONSTRAINT "inspection_tasks_window_check" CHECK ("floorwalk"."inspection_tasks"."starts_at" < "floorwalk"."inspection_tasks"."due_at"),
	CONSTRAINT "inspection_tasks_status_check" CHECK ("floorwalk"."inspection_tasks"."status" IN ('not_started', 'in_progress', 'submitted', 'overdue'))
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "self_assessment" text;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "first_self_assessment" text;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "first_result" text;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "uploaded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD COLUMN "incomplete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspections" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_item_decisions" ADD CONSTRAINT "inspection_item_decisions_inspection_item_id_inspection_items_id_fk" FOREIGN KEY ("inspection_item_id") REFERENCES "floorwalk"."inspection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_item_decisions" ADD CONSTRAINT "inspection_item_decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_tasks" ADD CONSTRAINT "inspection_tasks_org_site_fk" FOREIGN KEY ("org_id","site_id") REFERENCES "floorwalk"."sites"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_tasks" ADD CONSTRAINT "inspection_tasks_org_template_fk" FOREIGN KEY ("org_id","template_id") REFERENCES "floorwalk"."templates"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_item_decisions_item_created_idx" ON "floorwalk"."inspection_item_decisions" USING btree ("inspection_item_id","created_at");--> statement-breakpoint
CREATE INDEX "inspection_tasks_status_due_idx" ON "floorwalk"."inspection_tasks" USING btree ("status","due_at");--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspections" ADD CONSTRAINT "inspections_task_id_inspection_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "floorwalk"."inspection_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_task_id_unique" ON "floorwalk"."inspections" USING btree ("task_id") WHERE "floorwalk"."inspections"."task_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" DROP CONSTRAINT "inspection_items_result_check";--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_result_check" CHECK ("floorwalk"."inspection_items"."result" IN ('pending', 'pass', 'rework', 'fail'));--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_self_assessment_check" CHECK ("floorwalk"."inspection_items"."self_assessment" IS NULL OR "floorwalk"."inspection_items"."self_assessment" IN ('pass', 'fail'));--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_first_self_assessment_check" CHECK ("floorwalk"."inspection_items"."first_self_assessment" IS NULL OR "floorwalk"."inspection_items"."first_self_assessment" IN ('pass', 'fail'));--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_first_result_check" CHECK ("floorwalk"."inspection_items"."first_result" IS NULL OR "floorwalk"."inspection_items"."first_result" IN ('pass', 'rework', 'fail'));--> statement-breakpoint
ALTER TABLE "floorwalk"."inspection_items" ADD CONSTRAINT "inspection_items_upload_metadata_check" CHECK (("floorwalk"."inspection_items"."uploaded_by_id" IS NULL AND "floorwalk"."inspection_items"."uploaded_at" IS NULL)
        OR ("floorwalk"."inspection_items"."uploaded_by_id" IS NOT NULL AND "floorwalk"."inspection_items"."uploaded_at" IS NOT NULL));
