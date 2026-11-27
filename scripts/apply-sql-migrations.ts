import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(here, '../drizzle');

// Production migrations must use Neon’s direct endpoint, not the pooled
// runtime endpoint. Local/test environments may continue using DATABASE_URL
// or the legacy SQL_* settings.
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

if (process.env.NODE_ENV === 'production' && !migrationDatabaseUrl) {
  throw new Error('MIGRATION_DATABASE_URL must be set for production migrations.');
}

if (migrationDatabaseUrl) {
  const migrationHost = new URL(migrationDatabaseUrl).hostname;
  if (migrationHost.includes('-pooler')) {
    throw new Error('MIGRATION_DATABASE_URL must use Neon’s direct (non-pooler) endpoint.');
  }
}

const connectionString = migrationDatabaseUrl ?? databaseUrl;
const pool = new Pool({
  ...(connectionString
    ? {
        connectionString,
        // Keep TLS certificate verification enabled for Neon.
        ssl: { rejectUnauthorized: true },
      }
    : {
        // Backwards-compatible local/test configuration.
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
      }),
  max: 4,
  connectionTimeoutMillis: 15000,
});

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_sql_migrations (
    migration_name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await fs.readdir(migrationDirectory))
    .filter((name) => /^\\d{4}_.+\\.sql$/.test(name))
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
