import { loadConfig } from './config.js';
import { startFeedbackServer } from './server.js';
import { startDispatchConsumer } from './dispatch.consumer.js';

const config = loadConfig();

startFeedbackServer(config)
  .then((app) => {
    app.log.info(`Feedback service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start feedback service:', err);
    process.exit(1);
  });

// Start event consumer for automated survey dispatch
startDispatchConsumer(config).catch((err) => {
  console.error('Failed to start dispatch consumer:', err);
  // Non-fatal — service still handles HTTP requests
});

process.on('SIGTERM', () => {
  process.exit(0);
});
