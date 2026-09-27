import { loadConfig } from './config.js';
import { startCrmServer } from './server.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startCrmServer(config);

  // Start scheduled jobs
  startScheduler(config.kafkaBrokers);
  app.log.info('CRM scheduler started');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down CRM service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting CRM service:', err);
  process.exit(1);
});
