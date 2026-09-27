import { loadConfig } from './config.js';
import { startReportsServer } from './server.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startReportsServer(config);

  startScheduler();
  app.log.info('Report scheduler started');

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Reports service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting Reports service:', err);
  process.exit(1);
});
