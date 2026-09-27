import { loadConfig } from './config.js';
import { startContentAssistantServer } from './server.js';

const config = loadConfig();

startContentAssistantServer(config)
  .then((app) => {
    app.log.info(`Content Assistant service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start content-assistant service:', err);
    process.exit(1);
  });
