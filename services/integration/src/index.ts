import { loadConfig } from './config.js';
import { startIntegrationServer } from './server.js';
import { startDeliveryWorker } from './webhook.worker.js';

const config = loadConfig();

startIntegrationServer(config)
  .then((app) => {
    app.log.info(`Integration service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start integration service:', err);
    process.exit(1);
  });

// Start webhook delivery worker
startDeliveryWorker();

process.on('SIGTERM', () => {
  process.exit(0);
});
