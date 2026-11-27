CREATE TABLE IF NOT EXISTS "storage_objects" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "object_key" text NOT NULL UNIQUE,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL CHECK ("byte_size" > 0 AND "byte_size" <= 8388608),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "storage_objects_user_created_idx"
  ON "storage_objects" USING btree ("user_id", "created_at");
