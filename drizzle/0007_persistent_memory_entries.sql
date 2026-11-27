CREATE TABLE IF NOT EXISTS memory_entries (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('goal','decision','lesson','preference','workflow')),
  title text NOT NULL,
  content text NOT NULL,
  outcome text CHECK (outcome IS NULL OR outcome IN ('success','correction','insight')),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preserve existing memory entries stored in each owner's workspace JSON.
INSERT INTO memory_entries (id, user_id, category, title, content, outcome, tags, created_at, updated_at)
SELECT
  COALESCE(NULLIF(item->>'id', ''), 'legacy-memory-' || workspaces.user_id::text || '-' || md5(item::text)),
  workspaces.user_id,
  item->>'category',
  item->>'title',
  item->>'content',
  NULLIF(item->>'outcome', ''),
  CASE WHEN jsonb_typeof(item->'tags') = 'array' THEN item->'tags' ELSE '[]'::jsonb END,
  COALESCE(NULLIF(item->>'createdAt', '')::timestamptz, now()),
  now()
FROM workspaces
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(state_json->'memories') = 'array' THEN state_json->'memories' ELSE '[]'::jsonb END
) AS item
WHERE item->>'category' IN ('goal', 'decision', 'lesson', 'preference', 'workflow')
  AND COALESCE(NULLIF(item->>'title', ''), '') <> ''
  AND COALESCE(NULLIF(item->>'content', ''), '') <> ''
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS memory_entries_user_created_idx
  ON memory_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_entries_user_category_idx
  ON memory_entries (user_id, category);
CREATE INDEX IF NOT EXISTS memory_entries_search_idx
  ON memory_entries USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')));
