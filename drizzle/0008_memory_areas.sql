ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS memory_area text;

UPDATE memory_entries
SET memory_area = CASE
  WHEN category = 'preference' THEN 'owner_profile'
  WHEN category IN ('goal', 'workflow') THEN 'mission_projects'
  WHEN category IN ('decision', 'lesson') THEN 'knowledge_experience'
  ELSE 'knowledge_experience'
END
;

ALTER TABLE memory_entries
  ALTER COLUMN memory_area SET DEFAULT 'knowledge_experience',
  ALTER COLUMN memory_area SET NOT NULL;

ALTER TABLE memory_entries
  ADD CONSTRAINT memory_entries_area_check
  CHECK (memory_area IN ('owner_profile', 'mission_projects', 'knowledge_experience'));

CREATE INDEX IF NOT EXISTS memory_entries_user_area_created_idx
  ON memory_entries (user_id, memory_area, created_at DESC);
