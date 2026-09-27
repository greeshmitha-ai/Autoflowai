import { loadConfig } from './config.js';
import { startCollaborationServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await startCollaborationServer(config);

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Collaboration service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting Collaboration service:', err);
  process.exit(1);
});
