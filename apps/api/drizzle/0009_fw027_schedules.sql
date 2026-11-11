CREATE TABLE "floorwalk"."schedule_days" (
	"org_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "schedule_days_pk" PRIMARY KEY("org_id","schedule_id","weekday"),
	CONSTRAINT "schedule_days_weekday_check" CHECK ("floorwalk"."schedule_days"."weekday" BETWEEN 1 AND 7)
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."schedule_tasks" (
	"org_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"position" integer NOT NULL,
	"template_id" uuid NOT NULL,
	"starts_at" time(0) NOT NULL,
	"ends_at" time(0) NOT NULL,
	CONSTRAINT "schedule_tasks_pk" PRIMARY KEY("org_id","schedule_id","weekday","position"),
	CONSTRAINT "schedule_tasks_position_check" CHECK ("floorwalk"."schedule_tasks"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "schedules_org_name_unique" UNIQUE("org_id","name"),
	CONSTRAINT "schedules_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "schedules_name_nonempty_check" CHECK (char_length(btrim("floorwalk"."schedules"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."site_schedule_skips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"note" text,
	CONSTRAINT "site_schedule_skips_dates_check" CHECK ("floorwalk"."site_schedule_skips"."starts_on" <= "floorwalk"."site_schedule_skips"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."site_schedules" (
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	CONSTRAINT "site_schedules_pk" PRIMARY KEY("org_id","site_id")
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" ADD CONSTRAINT "sites_org_id_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD CONSTRAINT "templates_org_id_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "floorwalk"."schedule_days" ADD CONSTRAINT "schedule_days_schedule_fk" FOREIGN KEY ("org_id","schedule_id") REFERENCES "floorwalk"."schedules"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."schedule_tasks" ADD CONSTRAINT "schedule_tasks_day_fk" FOREIGN KEY ("org_id","schedule_id","weekday") REFERENCES "floorwalk"."schedule_days"("org_id","schedule_id","weekday") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."schedule_tasks" ADD CONSTRAINT "schedule_tasks_template_fk" FOREIGN KEY ("org_id","template_id") REFERENCES "floorwalk"."templates"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."schedules" ADD CONSTRAINT "schedules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "floorwalk"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."site_schedule_skips" ADD CONSTRAINT "site_schedule_skips_site_fk" FOREIGN KEY ("org_id","site_id") REFERENCES "floorwalk"."sites"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."site_schedules" ADD CONSTRAINT "site_schedules_site_fk" FOREIGN KEY ("org_id","site_id") REFERENCES "floorwalk"."sites"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."site_schedules" ADD CONSTRAINT "site_schedules_schedule_fk" FOREIGN KEY ("org_id","schedule_id") REFERENCES "floorwalk"."schedules"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_schedule_skips_site_dates_idx" ON "floorwalk"."site_schedule_skips" USING btree ("org_id","site_id","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "site_schedules_schedule_idx" ON "floorwalk"."site_schedules" USING btree ("org_id","schedule_id");
