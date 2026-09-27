import { loadConfig } from './config.js';
import { startMarketplaceServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await startMarketplaceServer(config);

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Marketplace service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting Marketplace service:', err);
  process.exit(1);
});
