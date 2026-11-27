import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

// Use the direct endpoint for schema operations. DATABASE_URL remains the
// pooled connection used by the running API.
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();
const databaseUrl = migrationDatabaseUrl ?? process.env.DATABASE_URL?.trim();
const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!databaseUrl) {
  if (!sqlHost) throw new Error('MIGRATION_DATABASE_URL, DATABASE_URL, or SQL_HOST must be set.');
  if (!sqlDbName) throw new Error('SQL_DB_NAME must be set in environment variables.');
  if (!user) throw new Error('SQL_ADMIN_USER must be set in environment variables.');
  if (!password) throw new Error('SQL_ADMIN_PASSWORD must be set in environment variables.');
}

if (migrationDatabaseUrl && new URL(migrationDatabaseUrl).hostname.includes('-pooler')) {
  throw new Error('MIGRATION_DATABASE_URL must use Neon’s direct (non-pooler) endpoint.');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: databaseUrl
    ? {
        url: databaseUrl,
        ssl: { rejectUnauthorized: true },
      }
    : {
        host: sqlHost!,
        user: user!,
        password: password!,
        database: sqlDbName!,
        ssl: false,
      },
  verbose: true,
});
