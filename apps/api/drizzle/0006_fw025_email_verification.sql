CREATE TABLE "floorwalk"."email_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "purpose" text NOT NULL,
  "code_hash" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "requested_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "recovery_token_hash" text,
  "consumed_at" timestamptz,
  CONSTRAINT "email_verifications_purpose_check"
    CHECK ("purpose" IN ('registration', 'password_recovery')),
  CONSTRAINT "email_verifications_attempt_count_check"
    CHECK ("attempt_count" BETWEEN 0 AND 5),
  CONSTRAINT "email_verifications_code_hash_check"
    CHECK ("code_hash" IS NOT NULL OR "purpose" = 'password_recovery'),
  CONSTRAINT "email_verifications_recovery_token_check"
    CHECK ("recovery_token_hash" IS NULL OR ("verified_at" IS NOT NULL AND "purpose" = 'password_recovery'))
);
--> statement-breakpoint
CREATE INDEX "email_verifications_scope_requested_idx"
  ON "floorwalk"."email_verifications" ("email", "purpose", "requested_at");
--> statement-breakpoint
CREATE INDEX "email_verifications_expires_idx"
  ON "floorwalk"."email_verifications" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_verifications_active_unique"
  ON "floorwalk"."email_verifications" ("email", "purpose")
  WHERE "consumed_at" IS NULL;
