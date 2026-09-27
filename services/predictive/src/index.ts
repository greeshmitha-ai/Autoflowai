import { loadConfig } from './config.js';
import { startPredictiveServer } from './server.js';
import { PredictiveService } from './predictive.service.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startPredictiveServer(config);
  const service = new PredictiveService();

  // Start weekly scheduler
  startScheduler(service);
  app.log.info('Predictive analytics scheduler started');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down predictive service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting predictive service:', err);
  process.exit(1);
});
