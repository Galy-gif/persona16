CREATE TYPE "public"."feedback_rating" AS ENUM('positive', 'negative');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"room_id" text NOT NULL,
	"turn_id" text,
	"message_id" text NOT NULL,
	"rating" "feedback_rating" NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "build_version" text DEFAULT 'development' NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "provider" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD COLUMN "trace_json" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_turn_id_turn_runs_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_user_message_unique" ON "feedback" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "feedback_room_updated_idx" ON "feedback" USING btree ("room_id","updated_at");