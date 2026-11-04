import pg from 'pg';
import { databaseTarget, inspectSyntheticDatabase } from './private-policy.mjs';
export async function checkDatabase() {
  databaseTarget(process.env);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query('SELECT current_database() AS name');
    if (result.rows[0].name !== process.env.PRIVATE_STAGE_DATABASE) throw new Error('Database identity mismatch');
    await inspectSyntheticDatabase(client);
    await client.query('ROLLBACK');
  } finally { await client.end(); }
}
