ALTER TABLE "storage_objects"
  ADD COLUMN IF NOT EXISTS "file_name" text NOT NULL DEFAULT 'file';
