CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "model" text;--> statement-breakpoint
UPDATE "turn_runs"
SET "prompt_version" = 'legacy-unversioned', "model" = 'legacy-unknown'
WHERE "prompt_version" IS NULL OR "model" IS NULL;--> statement-breakpoint
ALTER TABLE "turn_runs" ALTER COLUMN "prompt_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_runs" ALTER COLUMN "model" SET NOT NULL;
