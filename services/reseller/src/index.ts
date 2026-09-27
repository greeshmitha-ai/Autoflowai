import { loadConfig } from './config.js';
import { startResellerServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startResellerServer(config);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down reseller service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting reseller service:', err);
  process.exit(1);
});
