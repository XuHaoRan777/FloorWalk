CREATE TABLE "floorwalk"."chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"inspection_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text,
	"storage_key" text,
	"mime" text,
	"size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_seq_unique" UNIQUE("seq"),
	CONSTRAINT "chat_messages_body_or_image_check" CHECK ("floorwalk"."chat_messages"."body" IS NOT NULL OR "floorwalk"."chat_messages"."storage_key" IS NOT NULL),
	CONSTRAINT "chat_messages_body_length_check" CHECK ("floorwalk"."chat_messages"."body" IS NULL OR char_length("floorwalk"."chat_messages"."body") <= 1000),
	CONSTRAINT "chat_messages_image_fields_check" CHECK (("floorwalk"."chat_messages"."storage_key" IS NULL AND "floorwalk"."chat_messages"."mime" IS NULL AND "floorwalk"."chat_messages"."size" IS NULL)
        OR ("floorwalk"."chat_messages"."storage_key" IS NOT NULL AND "floorwalk"."chat_messages"."mime" IS NOT NULL AND "floorwalk"."chat_messages"."size" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "floorwalk"."sites" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "floorwalk"."templates" ADD COLUMN "is_current" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "floorwalk"."chat_messages" ADD CONSTRAINT "chat_messages_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "floorwalk"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorwalk"."chat_messages" ADD CONSTRAINT "chat_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "floorwalk"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_inspection_seq_idx" ON "floorwalk"."chat_messages" USING btree ("inspection_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_single_current_idx" ON "floorwalk"."templates" USING btree ("is_current") WHERE "floorwalk"."templates"."is_current" = true;
