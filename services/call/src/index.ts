import { loadConfig } from './config.js';
import { startCallServer } from './server.js';

const config = loadConfig();

startCallServer(config)
  .then((app) => {
    app.log.info(`Call service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start call service:', err);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  process.exit(0);
});
