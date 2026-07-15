ALTER TABLE "memories" ADD COLUMN "source_message_id" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "usage_json" jsonb;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "latency_json" jsonb;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;