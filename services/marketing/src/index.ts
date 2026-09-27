import { loadConfig } from './config.js';
import { startMarketingServer } from './server.js';

const config = loadConfig();

startMarketingServer(config)
  .then((app) => {
    app.log.info(`Marketing service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start marketing service:', err);
    process.exit(1);
  });
