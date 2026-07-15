CREATE TYPE "public"."memory_kind" AS ENUM('preference', 'repeated_pattern', 'boundary');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('candidate', 'confirmed', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."turn_status" AS ENUM('active', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"content" text NOT NULL,
	"status" "memory_status" DEFAULT 'candidate' NOT NULL,
	"source_turn_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"turn_id" text,
	"seq" integer NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"speech_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_agents" (
	"room_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "room_agents_room_id_agent_type_pk" PRIMARY KEY("room_id","agent_type")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "room_status" DEFAULT 'active' NOT NULL,
	"active_turn_id" text,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_events" (
	"turn_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	CONSTRAINT "turn_events_turn_id_seq_pk" PRIMARY KEY("turn_id","seq")
);
--> statement-breakpoint
CREATE TABLE "turn_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"base_room_version" integer NOT NULL,
	"base_history_length" integer NOT NULL,
	"result_room_version" integer,
	"status" "turn_status" NOT NULL,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"anonymous_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_anonymous_id_unique" UNIQUE("anonymous_id")
);
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_turn_id_turn_runs_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "public"."turn_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_turn_id_turn_runs_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_agents" ADD CONSTRAINT "room_agents_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_turn_id_turn_runs_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD CONSTRAINT "turn_runs_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_runs" ADD CONSTRAINT "turn_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memories_user_agent_status_idx" ON "memories" USING btree ("user_id","agent_type","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_room_seq_unique" ON "messages" USING btree ("room_id","seq");--> statement-breakpoint
CREATE INDEX "rooms_user_updated_idx" ON "rooms" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "turn_runs_room_created_idx" ON "turn_runs" USING btree ("room_id","created_at");