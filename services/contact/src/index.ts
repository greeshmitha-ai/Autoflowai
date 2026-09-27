import { loadConfig } from './config.js';
import { startContactServer } from './server.js';

const config = loadConfig();

startContactServer(config).catch((err) => {
  console.error('Failed to start Contact Service:', err);
  process.exit(1);
});
