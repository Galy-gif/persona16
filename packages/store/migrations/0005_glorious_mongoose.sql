CREATE TABLE "relationship_branches" (
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"character_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_branches_user_id_agent_type_pk" PRIMARY KEY("user_id","agent_type")
);
--> statement-breakpoint
CREATE TABLE "relationship_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"character_id" text NOT NULL,
	"event_type" text NOT NULL,
	"content" text NOT NULL,
	"source_turn_id" text NOT NULL,
	"source_memory_id" text,
	"target_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relationship_branches" ADD CONSTRAINT "relationship_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_events" ADD CONSTRAINT "relationship_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_events" ADD CONSTRAINT "relationship_events_source_turn_id_turn_runs_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "public"."turn_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_events" ADD CONSTRAINT "relationship_events_source_memory_id_memories_id_fk" FOREIGN KEY ("source_memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_events_source_memory_unique" ON "relationship_events" USING btree ("source_memory_id");--> statement-breakpoint
CREATE INDEX "relationship_events_user_agent_created_idx" ON "relationship_events" USING btree ("user_id","agent_type","created_at");--> statement-breakpoint
INSERT INTO "relationship_events" (
	"id", "user_id", "agent_type", "character_id", "event_type", "content",
	"source_turn_id", "source_memory_id", "created_at"
)
SELECT
	'memory:' || "id",
	"user_id",
	"agent_type",
	CASE "agent_type"
		WHEN 'INTJ' THEN 'lin-heng'
		WHEN 'ENFP' THEN 'xia-xu'
		WHEN 'ISFJ' THEN 'zhou-he'
		WHEN 'ESTP' THEN 'xu-ye'
		ELSE 'legacy-' || lower("agent_type")
	END,
	CASE "kind"::text
		WHEN 'preference' THEN 'preference_stated'
		WHEN 'boundary' THEN 'boundary_set'
		ELSE 'pattern_confirmed'
	END,
	"content",
	"source_turn_id",
	"id",
	"updated_at"
FROM "memories"
WHERE "status" = 'confirmed'
	AND EXISTS (
		SELECT 1 FROM "turn_runs"
		WHERE "turn_runs"."id" = "memories"."source_turn_id"
			AND "turn_runs"."user_id" = "memories"."user_id"
			AND "turn_runs"."status" = 'completed'
	)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "relationship_branches" (
	"user_id", "agent_type", "character_id", "state_json"
)
SELECT
	"user_id",
	"agent_type",
	"character_id",
	jsonb_build_object(
		'version', 1,
		'characterId', "character_id",
		'memoryEnabled', true,
		'sharedContext', COALESCE(
			jsonb_agg(jsonb_build_object(
				'id', 'context:' || "id",
				'content', "content",
				'sourceEventId', "id",
				'sourceTurnId', "source_turn_id"
			) ORDER BY "created_at", "id") FILTER (WHERE "event_type" = 'pattern_confirmed'),
			'[]'::jsonb
		),
		'interactionStyle', COALESCE(
			jsonb_agg(jsonb_build_object(
				'id', 'style:' || "id",
				'content', "content",
				'sourceEventId', "id",
				'sourceTurnId', "source_turn_id"
			) ORDER BY "created_at", "id") FILTER (WHERE "event_type" = 'preference_stated'),
			'[]'::jsonb
		),
		'boundaries', COALESCE(
			jsonb_agg(jsonb_build_object(
				'id', 'boundary:' || "id",
				'content', "content",
				'sourceEventId', "id",
				'sourceTurnId', "source_turn_id",
				'status', 'active'
			) ORDER BY "created_at", "id") FILTER (WHERE "event_type" = 'boundary_set'),
			'[]'::jsonb
		),
		'tensions', '[]'::jsonb,
		'turningPoints', '[]'::jsonb,
		'trust', jsonb_build_object('reliability', 'unknown', 'disclosure', 'guarded'),
		'recentClimate', 'unfamiliar',
		'eventLog', jsonb_agg(jsonb_build_object(
			'id', "id",
			'type', "event_type",
			'sourceTurnId', "source_turn_id",
			'content', "content"
		) ORDER BY "created_at", "id")
	)
FROM "relationship_events"
GROUP BY "user_id", "agent_type", "character_id"
ON CONFLICT DO NOTHING;
