import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigrationPool } from '../src/db/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(here, '../drizzle');
const pool = createMigrationPool();

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_sql_migrations (
    migration_name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await fs.readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();

  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('project-jerry-sql-migrations'))");
      const alreadyApplied = await client.query(
        'SELECT 1 FROM app_sql_migrations WHERE migration_name = $1', [name],
      );
      if (alreadyApplied.rowCount) {
        await client.query('COMMIT');
        continue;
      }
      const sql = await fs.readFile(path.join(migrationDirectory, name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO app_sql_migrations (migration_name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied SQL migration: ${name}`);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* retain migration error */ }
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
