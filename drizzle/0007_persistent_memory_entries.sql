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

CREATE INDEX IF NOT EXISTS memory_entries_user_created_idx
  ON memory_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_entries_user_category_idx
  ON memory_entries (user_id, category);
CREATE INDEX IF NOT EXISTS memory_entries_search_idx
  ON memory_entries USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')));
