import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function migrateDatabase(connection: string | Pool): Promise<void> {
  const ownsPool = typeof connection === 'string';
  const pool = ownsPool ? new Pool({ connectionString: connection }) : connection;
  try {
    await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  } finally {
    if (ownsPool) await pool.end();
  }
}
