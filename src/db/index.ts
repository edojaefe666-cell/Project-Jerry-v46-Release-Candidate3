import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createMigrationPool = () => {
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL?.trim();

  // Production migrations must use Neon’s direct endpoint, not the pooled runtime endpoint.
  if (process.env.NODE_ENV === 'production' && !migrationDatabaseUrl) {
    throw new Error('MIGRATION_DATABASE_URL must be set for production migrations.');
  }

  if (!migrationDatabaseUrl) return createPool();

  return new Pool({
    connectionString: migrationDatabaseUrl,
    // Keep TLS certificate verification enabled for the direct Neon connection.
    ssl: { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 15000,
  });
};

export const createPool = () => {
  if (!global._postgresPool) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    global._postgresPool = new Pool({
      ...(databaseUrl
        ? {
            connectionString: databaseUrl,
            // Neon requires TLS. Keep certificate verification enabled.
            ssl: { rejectUnauthorized: true },
          }
        : {
            // Backwards-compatible local/test configuration.
            host: process.env.SQL_HOST,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DB_NAME,
          }),
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
