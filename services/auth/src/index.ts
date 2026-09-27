import { loadConfig } from './config.js';
import { startAuthServer } from './server.js';

const config = loadConfig();

startAuthServer(config).catch((err) => {
  console.error('Failed to start auth service:', err);
  process.exit(1);
});
