import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closePool } from './connection.js';
import path from 'path';

async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  const db = getDb();

  // Migrations folder is relative to the compiled output location
  const migrationsFolder = path.join(process.cwd(), 'migrations');

  await migrate(db, { migrationsFolder });

  console.log('Migrations completed successfully.');
  await closePool();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
