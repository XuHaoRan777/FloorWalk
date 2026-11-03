CREATE TABLE "floorwalk"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floorwalk"."site_supervisors" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" DROP CONSTRAINT "sites_code_unique";--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" DROP CONSTRAINT "templates_name_unique";--> statement-breakpoint
ALTER TABLE "floorwalk"."sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD COLUMN "org_id" uuid;--> statement-breakpoint
INSERT INTO "floorwalk"."organizations" ("name") VALUES ('Northbean');--> statement-breakpoint
UPDATE "floorwalk"."sites" SET "org_id" = (SELECT "id" FROM "floorwalk"."organizations" WHERE "name" = 'Northbean');--> statement-breakpoint
UPDATE "floorwalk"."templates" SET "org_id" = (SELECT "id" FROM "floorwalk"."organizations" WHERE "name" = 'Northbean');--> statement-breakpoint
UPDATE "floorwalk"."users" SET "org_id" = (SELECT "id" FROM "floorwalk"."organizations" WHERE "name" = 'Northbean');--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
UPDATE "floorwalk"."users" SET "role" = 'admin' WHERE "role" = 'hq';--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('inspector', 'supervisor', 'admin'));--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "floorwalk"."site_supervisors" ADD CONSTRAINT "site_supervisors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "floorwalk"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."site_supervisors" ADD CONSTRAINT "site_supervisors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" ADD CONSTRAINT "sites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "floorwalk"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD CONSTRAINT "templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "floorwalk"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "floorwalk"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" ADD CONSTRAINT "sites_org_code_unique" UNIQUE("org_id","code");--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD CONSTRAINT "templates_org_name_unique" UNIQUE("org_id","name");
