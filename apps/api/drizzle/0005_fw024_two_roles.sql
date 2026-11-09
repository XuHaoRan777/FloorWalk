DROP TABLE "floorwalk"."site_supervisors";
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" DROP CONSTRAINT "users_email_unique";
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" DROP CONSTRAINT "users_role_check";
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" DROP CONSTRAINT "users_role_site_check";
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" RENAME COLUMN "email" TO "login_name";
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_org_login_name_unique" UNIQUE ("org_id", "login_name");
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('admin', 'store_manager'));
--> statement-breakpoint
ALTER TABLE "floorwalk"."users" ADD CONSTRAINT "users_role_site_check" CHECK (("role" = 'store_manager' AND "site_id" IS NOT NULL) OR ("role" = 'admin' AND "site_id" IS NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_admin_per_org" ON "floorwalk"."users" ("org_id") WHERE "role" = 'admin';
--> statement-breakpoint
CREATE TABLE "floorwalk"."inspection_participants" (
  "inspection_id" uuid NOT NULL REFERENCES "floorwalk"."inspections"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "floorwalk"."users"("id"),
  PRIMARY KEY ("inspection_id", "user_id")
);
--> statement-breakpoint
DELETE FROM "floorwalk"."organizations" o
WHERE NOT EXISTS (SELECT 1 FROM "floorwalk"."users" u WHERE u."org_id" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "floorwalk"."sites" s WHERE s."org_id" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "floorwalk"."templates" t WHERE t."org_id" = o."id");
--> statement-breakpoint
CREATE FUNCTION "floorwalk"."assert_org_admin"(org uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "floorwalk"."organizations" WHERE "id" = org)
     AND NOT EXISTS (SELECT 1 FROM "floorwalk"."users" WHERE "org_id" = org AND "role" = 'admin') THEN
    RAISE EXCEPTION 'organization must have an admin' USING ERRCODE = '23514', CONSTRAINT = 'organizations_require_admin';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "floorwalk"."check_organization_admin"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "floorwalk"."assert_org_admin"(NEW."id");
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "floorwalk"."check_user_organization_admin"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "floorwalk"."assert_org_admin"(OLD."org_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM "floorwalk"."assert_org_admin"(NEW."org_id");
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "organizations_require_admin" AFTER INSERT ON "floorwalk"."organizations"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "floorwalk"."check_organization_admin"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "users_require_org_admin" AFTER INSERT OR UPDATE OR DELETE ON "floorwalk"."users"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "floorwalk"."check_user_organization_admin"();
