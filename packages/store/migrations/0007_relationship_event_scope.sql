ALTER TABLE "relationship_events" DROP CONSTRAINT "relationship_events_pkey";
--> statement-breakpoint
ALTER TABLE "relationship_events"
  ADD CONSTRAINT "relationship_events_user_id_agent_type_id_pk"
  PRIMARY KEY("user_id", "agent_type", "id");
--> statement-breakpoint
UPDATE "relationship_events"
SET "character_id" = 'legacy-' || lower("agent_type")
WHERE "character_id" IS DISTINCT FROM 'legacy-' || lower("agent_type");
--> statement-breakpoint
UPDATE "relationship_branches"
SET "character_id" = 'legacy-' || lower("agent_type"),
    "state_json" = jsonb_set(
      "state_json",
      '{characterId}',
      to_jsonb('legacy-' || lower("agent_type")),
      true
    ),
    "updated_at" = now()
WHERE "character_id" IS DISTINCT FROM 'legacy-' || lower("agent_type")
   OR "state_json" ->> 'characterId' IS DISTINCT FROM 'legacy-' || lower("agent_type");
